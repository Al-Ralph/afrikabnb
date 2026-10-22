// Administration : statistiques, rôles, modération des annonces et des avis.
// Sans req/res (le journal d'audit reste au contrôleur) : erreurs métier levées via httpError,
// client Prisma injectable (`db`).
import prisma from "../config/db.js";
import { httpError } from "../utils/httpError.js";
import { recomputeListingRating } from "./reviews.js";

const countBy = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], r._count._all]));

export async function getStats(db = prisma) {
  const [users, listings, bookings, revenueRows] = await Promise.all([
    db.user.groupBy({ by: ["role"], _count: { _all: true } }),
    db.listing.groupBy({ by: ["status"], _count: { _all: true } }),
    db.booking.groupBy({ by: ["status"], _count: { _all: true } }),
    // Revenus des réservations confirmées, par devise de l'annonce.
    db.$queryRaw`
      SELECT l."currency" AS "currency", SUM(b."totalPrice") AS "total", COUNT(*)::int AS "count"
      FROM "Booking" b JOIN "Listing" l ON l."id" = b."listingId"
      WHERE b."status" = 'CONFIRMED'
      GROUP BY l."currency" ORDER BY l."currency"`,
  ]);
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const usersByRole = countBy(users, "role");
  const listingsByStatus = countBy(listings, "status");
  const bookingsByStatus = countBy(bookings, "status");
  return {
    users: { total: sum(usersByRole), byRole: usersByRole },
    listings: { total: sum(listingsByStatus), byStatus: listingsByStatus },
    bookings: { total: sum(bookingsByStatus), byStatus: bookingsByStatus },
    confirmedRevenue: revenueRows.map((r) => ({
      currency: r.currency,
      total: Number(r.total),
      bookings: r.count,
    })),
  };
}

const adminUserSelect = {
  id: true,
  email: true,
  name: true,
  avatar: true,
  role: true,
  createdAt: true,
  _count: { select: { listings: true, bookings: true } },
};

const adminHostSelect = { select: { id: true, name: true, email: true, avatar: true } };

// -> { data (lignes adminUserSelect), total }
export async function listUsers({ q, role, limit, offset }, db = prisma) {
  const where = {};
  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
    ];
  }
  if (role) where.role = role;
  const [data, total] = await Promise.all([
    db.user.findMany({ where, select: adminUserSelect, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
    db.user.count({ where }),
  ]);
  return { data, total };
}

// Interdit : se rétrograder soi-même, retirer le rôle ADMIN au dernier administrateur.
// -> { before (rôle précédent), user (ligne adminUserSelect) }
export async function updateUserRole({ actor, targetId, role }, db = prisma) {
  if (targetId === actor.id && role !== "ADMIN") {
    throw httpError(409, "Impossible de retirer son propre rôle d'administrateur");
  }
  // Sérialisable : deux rétrogradations concurrentes ne peuvent pas supprimer le dernier admin
  // (conflit -> P2034 -> 409).
  return db.$transaction(
    async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId }, select: { id: true, role: true } });
      if (!target) throw httpError(404, "Utilisateur introuvable");
      if (target.role === "ADMIN" && role !== "ADMIN") {
        const admins = await tx.user.count({ where: { role: "ADMIN" } });
        if (admins <= 1) throw httpError(409, "Impossible de retirer le dernier administrateur");
      }
      const updated = await tx.user.update({ where: { id: targetId }, data: { role }, select: adminUserSelect });
      return { before: target.role, user: updated };
    },
    { isolationLevel: "Serializable" }
  );
}

// Annonces (masquées comprises) -> { data (avec host et _count), total }
export async function listListings({ q, status, limit, offset }, db = prisma) {
  const where = {};
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { location: { contains: q, mode: "insensitive" } },
      { host: { email: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (status) where.status = status;
  const [data, total] = await Promise.all([
    db.listing.findMany({
      where,
      include: {
        host: adminHostSelect,
        _count: { select: { bookings: true, reviews: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.listing.count({ where }),
  ]);
  return { data, total };
}

// -> { before (statut précédent), listing }
export async function updateListingStatus({ listingId, status }, db = prisma) {
  const existing = await db.listing.findUnique({ where: { id: listingId }, select: { status: true } });
  if (!existing) throw httpError(404, "Annonce introuvable");
  const listing = await db.listing.update({
    where: { id: listingId },
    data: { status },
    include: { host: adminHostSelect },
  });
  return { before: existing.status, listing };
}

// Avis les plus récents -> { data, total }
export async function listReviews({ limit, offset }, db = prisma) {
  const [data, total] = await Promise.all([
    db.review.findMany({
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        author: { select: { id: true, name: true, email: true, avatar: true } },
        listing: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.review.count(),
  ]);
  return { data, total };
}

// Supprime un avis et recalcule la note -> { id, rating, reviewCount } de l'annonce.
export function deleteReview(reviewId, db = prisma) {
  return db.$transaction(async (tx) => {
    const review = await tx.review.findUnique({ where: { id: reviewId }, select: { id: true, listingId: true } });
    if (!review) throw httpError(404, "Avis introuvable");
    await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${review.listingId} FOR UPDATE`;
    await tx.review.delete({ where: { id: review.id } });
    return recomputeListingRating(tx, review.listingId);
  });
}
