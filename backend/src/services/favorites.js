// Favoris des utilisateurs (ajout / retrait idempotents).
// Sans req/res : erreurs métier levées via httpError, client Prisma injectable (`db`).
import prisma from "../config/db.js";
import { httpError } from "../utils/httpError.js";
import { listingBaseInclude } from "../api/listings/listings.serializers.js";

// Annonce publique (ACTIVE) uniquement, sinon 404.
export async function addFavorite({ listingId, userId }, db = prisma) {
  const listing = await db.listing.findUnique({ where: { id: listingId }, select: { id: true, status: true } });
  if (!listing || listing.status !== "ACTIVE") throw httpError(404, "Annonce introuvable");
  await db.favorite.upsert({
    where: { userId_listingId: { userId, listingId } },
    update: {},
    create: { userId, listingId },
  });
}

export async function removeFavorite({ listingId, userId }, db = prisma) {
  await db.favorite.deleteMany({ where: { userId, listingId } });
}

// Favoris avec l'annonce complète, le plus récent d'abord.
export function listFavorites(userId, db = prisma) {
  return db.favorite.findMany({
    // Annonces masquées par la modération exclues.
    where: { userId, listing: { status: "ACTIVE" } },
    include: { listing: { include: listingBaseInclude } },
    orderBy: { createdAt: "desc" },
  });
}
