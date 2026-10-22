// Règles métier des annonces (recherche, visibilité, propriété, tableau de bord hôte).
// Sans req/res : erreurs métier levées via httpError, client Prisma injectable (`db`).
import { Prisma } from "@prisma/client";
import prisma from "../config/db.js";
import { httpError } from "../utils/httpError.js";
import { addDays, parseDay, todayDay } from "../utils/booking.js";
import { blockingBookingWhere } from "../utils/bookingStatus.js";
import { computeHostStats } from "../utils/hostStats.js";
import { buildListingWhere, findListingIdsByText, listingOrderBy, searchText } from "../api/listings/listings.query.js";
import { listingBaseInclude } from "../api/listings/listings.serializers.js";
import { hostBookingInclude } from "./bookings.js";
import { removeFromStorage, setExternalCover, storagePathsOf, syncCoverImage } from "./listingImages.js";

// Inclut le statut favori uniquement pour un utilisateur authentifié (optionalAuth).
function listingInclude(userId) {
  const include = { ...listingBaseInclude };
  if (userId) include.favorites = { where: { userId }, select: { id: true } };
  return include;
}

// Annonce existante dont `userId` est l'hôte, sinon 404 / 403 (`forbidden` : message du 403).
export async function findOwnedListing(listingId, userId, forbidden, db = prisma) {
  const existing = await db.listing.findUnique({ where: { id: listingId } });
  if (!existing) throw httpError(404, "Annonce introuvable");
  if (existing.hostId !== userId) throw httpError(403, forbidden);
  return existing;
}

// Fourchette de prix globale des annonces publiques (curseurs du front), indépendante des filtres.
export async function priceRangeOf(db = prisma) {
  const agg = await db.listing.aggregate({
    where: { status: "ACTIVE" },
    _min: { pricePerNight: true },
    _max: { pricePerNight: true },
  });
  const n = (v) => (v != null ? Number(v) : null);
  return { min: n(agg._min.pricePerNight), max: n(agg._max.pricePerNight) };
}

// Recherche paginée (query déjà validée) -> { listings, total, priceRange }.
export async function searchListings(query, userId, db = prisma) {
  const { limit, offset, sort } = query;
  const text = searchText(query);
  const textMatchIds = text ? await findListingIdsByText(db, text) : undefined;
  const where = buildListingWhere(query, { textMatchIds });
  const [listings, total, priceRange] = await Promise.all([
    db.listing.findMany({
      where,
      include: listingInclude(userId),
      orderBy: listingOrderBy(sort),
      take: limit,
      skip: offset,
    }),
    db.listing.count({ where }),
    priceRangeOf(db),
  ]);
  return { listings, total, priceRange };
}

// Annonce visible par `viewerId` (facultatif), sinon 404.
export async function getListing(listingId, viewerId, db = prisma) {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: listingInclude(viewerId),
  });
  if (!listing) throw httpError(404, "Annonce introuvable");
  // Annonce masquée : visible uniquement par son hôte et les administrateurs.
  if (listing.status !== "ACTIVE" && listing.hostId !== viewerId) {
    const viewer = viewerId ? await db.user.findUnique({ where: { id: viewerId }, select: { role: true } }) : null;
    if (viewer?.role !== "ADMIN") throw httpError(404, "Annonce introuvable");
  }
  return listing;
}

// Annonces de l'hôte, avec le nombre de réservations en cours ou à venir (_count.bookings).
export function listHostListings(hostId, db = prisma) {
  return db.listing.findMany({
    where: { hostId },
    include: {
      ...listingBaseInclude,
      _count: {
        select: {
          bookings: { where: { ...blockingBookingWhere(), checkOut: { gt: parseDay(todayDay()) } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

// Tableau de bord hôte -> { ...computeHostStats, listingsCount, pendingRequests, upcoming (réservations brutes) }.
export async function getHostStats(hostId, db = prisma) {
  const today = todayDay();
  const [listings, bookings, upcoming, pendingRequests] = await Promise.all([
    db.listing.findMany({
      where: { hostId },
      select: { id: true, title: true, currency: true, rating: true, reviewCount: true, status: true },
      orderBy: { createdAt: "desc" },
    }),
    db.booking.findMany({
      where: { status: "CONFIRMED", listing: { hostId } },
      select: { listingId: true, checkIn: true, checkOut: true, totalPrice: true },
    }),
    db.booking.findMany({
      where: {
        listing: { hostId },
        ...blockingBookingWhere(),
        checkIn: { gte: parseDay(today), lt: parseDay(addDays(today, 90)) },
      },
      include: hostBookingInclude,
      orderBy: { checkIn: "asc" },
      take: 10,
    }),
    db.booking.count({
      where: { listing: { hostId }, ...blockingBookingWhere(), status: "PENDING" },
    }),
  ]);
  const stats = computeHostStats({ listings, bookings, today });
  return { ...stats, listingsCount: listings.length, pendingRequests, upcoming };
}

// Publier une annonce fait passer un voyageur (GUEST) au rôle HOST.
export function createListing(user, input, db = prisma) {
  const { pricePerNight, acceptsPets, imageUrl, ...fields } = input;
  return db.$transaction(async (tx) => {
    const created = await tx.listing.create({
      data: {
        ...fields,
        pricePerNight: new Prisma.Decimal(pricePerNight),
        acceptsPets: acceptsPets ?? false,
        imageUrl: imageUrl ?? null,
        hostId: user.id,
        // imageUrl (compatibilité) : première photo de l'annonce.
        ...(imageUrl ? { images: { create: [{ url: imageUrl, position: 0, alt: fields.title.slice(0, 200) }] } } : {}),
      },
    });
    await tx.user.updateMany({ where: { id: user.id, role: "GUEST" }, data: { role: "HOST" } });
    return tx.listing.findUnique({ where: { id: created.id }, include: listingBaseInclude });
  });
}

export async function updateListing(listingId, user, input, db = prisma) {
  const existing = await findOwnedListing(listingId, user.id, "Non autorisé à modifier cette annonce", db);
  // imageUrl n'est plus écrit directement : il reflète la première photo. Une URL fournie
  // devient la photo de couverture ; null est ignoré (supprimer les photos via DELETE images).
  const { imageUrl, ...data } = input;
  if (data.pricePerNight !== undefined) data.pricePerNight = new Prisma.Decimal(data.pricePerNight);
  return db.$transaction(async (tx) => {
    await tx.listing.update({ where: { id: listingId }, data });
    if (imageUrl) await setExternalCover(tx, listingId, imageUrl, data.title ?? existing.title);
    else await syncCoverImage(tx, listingId);
    return tx.listing.findUnique({ where: { id: listingId }, include: listingBaseInclude });
  });
}

// `log` : journal des échecs de suppression des fichiers (non bloquants).
export async function deleteListing(listingId, user, log, db = prisma) {
  const existing = await findOwnedListing(listingId, user.id, "Non autorisé à supprimer cette annonce", db);
  const paths = await storagePathsOf(existing.id, db);
  await db.listing.delete({ where: { id: listingId } });
  // Après suppression en base : fichiers des photos téléversées (la cascade ne touche que la base).
  await removeFromStorage(paths, log);
}
