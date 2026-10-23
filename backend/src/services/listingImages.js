// Photos des annonces : traitement (sharp), stockage, ordre, couverture (Listing.imageUrl).
// Sans req/res : erreurs métier levées via httpError, client Prisma injectable (`db`).
import crypto from "node:crypto";
import sharp from "sharp";
import prisma from "../config/db.js";
import { storage } from "./storage/index.js";
import { httpError } from "../utils/httpError.js";
import { MAX_IMAGES_PER_LISTING } from "../middleware/upload.js";
import { imagesInclude } from "../api/listings/listings.serializers.js";

const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 80;
// Garde-fou contre les « bombes de décompression » (≈ 6000 × 4000 px).
const MAX_INPUT_PIXELS = 25_000_000;
// Un seul thread libvips : borne le CPU consommé par les envois simultanés.
sharp.concurrency(1);

// Listing.imageUrl = URL de la première image (couverture), ou null sans image.
// À appeler dans la transaction qui modifie les images.
export async function syncCoverImage(tx, listingId) {
  const first = await tx.listingImage.findFirst({
    where: { listingId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { url: true },
  });
  await tx.listing.update({ where: { id: listingId }, data: { imageUrl: first?.url ?? null } });
}

// Renumérote les positions 0..n-1 dans l'ordre donné (ou l'ordre actuel).
async function renumber(tx, listingId, orderedIds) {
  const ids =
    orderedIds ??
    (
      await tx.listingImage.findMany({
        where: { listingId },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      })
    ).map((i) => i.id);
  for (const [position, id] of ids.entries()) {
    await tx.listingImage.update({ where: { id }, data: { position } });
  }
}

// Ajoute une image externe (URL https saisie, compatibilité de `imageUrl`) en couverture.
// Déjà présente : simplement remontée en première position.
export async function setExternalCover(tx, listingId, url, alt) {
  const images = await tx.listingImage.findMany({
    where: { listingId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, url: true },
  });
  let cover = images.find((i) => i.url === url);
  if (!cover) {
    if (images.length >= MAX_IMAGES_PER_LISTING) {
      throw httpError(400, `${MAX_IMAGES_PER_LISTING} images maximum par annonce`);
    }
    cover = await tx.listingImage.create({
      data: { listingId, url, path: null, position: 0, alt: alt?.slice(0, 200) || null },
      select: { id: true },
    });
  }
  await renumber(tx, listingId, [cover.id, ...images.filter((i) => i.id !== cover.id).map((i) => i.id)]);
  await syncCoverImage(tx, listingId);
}

async function ownedListing(listingId, userId, db) {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true, hostId: true, title: true },
  });
  if (!listing) throw httpError(404, "Annonce introuvable");
  if (listing.hostId !== userId) throw httpError(403, "Non autorisé à modifier cette annonce");
  return listing;
}

const listImages = (listingId, db) => db.listingImage.findMany({ where: { listingId }, ...imagesInclude });

// Supprime des fichiers du stockage sans faire échouer la requête (fichier orphelin journalisé).
export async function removeFromStorage(paths, log) {
  for (const p of paths) {
    try {
      await storage.remove(p);
    } catch (err) {
      log.error({ err: { message: err.message }, path: p }, "[images] suppression du stockage impossible");
    }
  }
}

// Rotation EXIF, suppression des métadonnées (GPS…), 1600 px max, WebP qualité 80.
async function processImage(buffer) {
  try {
    const { data, info } = await sharp(buffer, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw httpError(415, "Image illisible ou corrompue");
  }
}

// Ajoute des photos (fichiers multer : { buffer }) -> liste complète des images de l'annonce.
export async function uploadImages({ listingId, userId, files, log }, db = prisma) {
  const uploaded = [];
  try {
    const listing = await ownedListing(listingId, userId, db);
    const existing = await db.listingImage.count({ where: { listingId: listing.id } });
    if (existing + files.length > MAX_IMAGES_PER_LISTING) {
      throw httpError(400, `${MAX_IMAGES_PER_LISTING} images maximum par annonce (${existing} déjà en ligne)`);
    }

    const processed = [];
    for (const file of files) processed.push(await processImage(file.buffer));
    for (const img of processed) {
      const key = `listings/${listing.id}/${crypto.randomUUID()}.webp`;
      const stored = await storage.put(key, img.data, "image/webp");
      uploaded.push({ ...stored, width: img.width, height: img.height });
    }

    const images = await db.$transaction(async (tx) => {
      // Verrou de l'annonce : limite de 10 images vérifiée sans course entre deux envois.
      await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${listing.id} FOR UPDATE`;
      const count = await tx.listingImage.count({ where: { listingId: listing.id } });
      if (count + uploaded.length > MAX_IMAGES_PER_LISTING) {
        throw httpError(409, `${MAX_IMAGES_PER_LISTING} images maximum par annonce`);
      }
      const last = await tx.listingImage.aggregate({ where: { listingId: listing.id }, _max: { position: true } });
      let position = (last._max.position ?? -1) + 1;
      for (const u of uploaded) {
        await tx.listingImage.create({
          data: {
            listingId: listing.id,
            url: u.url,
            path: u.path,
            position: position++,
            alt: `${listing.title} – photo ${position}`.slice(0, 200),
            width: u.width,
            height: u.height,
          },
        });
      }
      await syncCoverImage(tx, listing.id);
      return listImages(listing.id, tx);
    });
    log.info({ listingId: listing.id, count: uploaded.length }, "[images] photos ajoutées");
    return images;
  } catch (err) {
    // Échec après envoi au stockage : pas de fichier orphelin.
    if (uploaded.length) await removeFromStorage(uploaded.map((u) => u.path), log);
    throw err;
  }
}

// Supprime une photo -> images restantes.
export async function removeImage({ listingId, imageId, userId, log }, db = prisma) {
  const listing = await ownedListing(listingId, userId, db);
  const { removed, images } = await db.$transaction(async (tx) => {
    const image = await tx.listingImage.findFirst({
      where: { id: imageId, listingId: listing.id },
      select: { id: true, path: true },
    });
    if (!image) throw httpError(404, "Image introuvable");
    await tx.listingImage.delete({ where: { id: image.id } });
    await renumber(tx, listing.id);
    await syncCoverImage(tx, listing.id);
    return { removed: image, images: await listImages(listing.id, tx) };
  });
  // Après commit : suppression du fichier (images externes, path null : rien à supprimer).
  if (removed.path) await removeFromStorage([removed.path], log);
  return images;
}

// Permutation complète des images (imageIds) -> images dans le nouvel ordre.
export async function reorderImages({ listingId, userId, imageIds }, db = prisma) {
  const listing = await ownedListing(listingId, userId, db);
  return db.$transaction(async (tx) => {
    const current = await tx.listingImage.findMany({ where: { listingId: listing.id }, select: { id: true } });
    const currentIds = new Set(current.map((i) => i.id));
    if (imageIds.length !== currentIds.size || !imageIds.every((id) => currentIds.has(id))) {
      throw httpError(400, "imageIds doit contenir exactement toutes les images de l'annonce");
    }
    await renumber(tx, listing.id, imageIds);
    await syncCoverImage(tx, listing.id);
    return listImages(listing.id, tx);
  });
}

// Fichiers du stockage d'une annonce (avant sa suppression : la cascade ne touche que la base).
export async function storagePathsOf(listingId, db = prisma) {
  const rows = await db.listingImage.findMany({
    where: { listingId, path: { not: null } },
    select: { path: true },
  });
  return rows.map((r) => r.path);
}
