import prisma from "../../config/db.js";
import { httpError } from "../../utils/httpError.js";
import { listingToJson } from "../listings/listings.serializers.js";
import { recomputeListingRating } from "../reviews/reviews.controller.js";

// Journal des actions d'administration (qui, quoi, sur quelle cible).
function audit(req, action, target, details = {}) {
  req.log.info({ adminId: req.user.id, action, target, ...details }, `[admin] ${action}`);
}

const countBy = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], r._count._all]));

// GET /api/admin/stats
export async function stats(req, res, next) {
  try {
    const [users, listings, bookings, revenueRows] = await Promise.all([
      prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      prisma.listing.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.booking.groupBy({ by: ["status"], _count: { _all: true } }),
      // Revenus des réservations confirmées, par devise de l'annonce.
      prisma.$queryRaw`
        SELECT l."currency" AS "currency", SUM(b."totalPrice") AS "total", COUNT(*)::int AS "count"
        FROM "Booking" b JOIN "Listing" l ON l."id" = b."listingId"
        WHERE b."status" = 'CONFIRMED'
        GROUP BY l."currency" ORDER BY l."currency"`,
    ]);
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    const usersByRole = countBy(users, "role");
    const listingsByStatus = countBy(listings, "status");
    const bookingsByStatus = countBy(bookings, "status");
    res.json({
      users: { total: sum(usersByRole), byRole: usersByRole },
      listings: { total: sum(listingsByStatus), byStatus: listingsByStatus },
      bookings: { total: sum(bookingsByStatus), byStatus: bookingsByStatus },
      confirmedRevenue: revenueRows.map((r) => ({
        currency: r.currency,
        total: Number(r.total),
        bookings: r.count,
      })),
    });
  } catch (err) {
    next(err);
  }
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

const userToJson = ({ _count, ...u }) => ({ ...u, listingsCount: _count.listings, bookingsCount: _count.bookings });

// GET /api/admin/users?q&role&limit&offset
export async function users(req, res, next) {
  try {
    const { q, role, limit, offset } = req.query;
    const where = {};
    if (q) {
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ];
    }
    if (role) where.role = role;
    const [data, total] = await Promise.all([
      prisma.user.findMany({ where, select: adminUserSelect, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
      prisma.user.count({ where }),
    ]);
    res.json({ data: data.map(userToJson), total, limit, offset });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/users/:id/role { role }
// Interdit : se rétrograder soi-même, retirer le rôle ADMIN au dernier administrateur.
export async function updateUserRole(req, res, next) {
  try {
    const { role } = req.body;
    const targetId = req.params.id;
    if (targetId === req.user.id && role !== "ADMIN") {
      throw httpError(409, "Impossible de retirer son propre rôle d'administrateur");
    }
    // Sérialisable : deux rétrogradations concurrentes ne peuvent pas supprimer le dernier admin
    // (conflit -> P2034 -> 409).
    const { before, user } = await prisma.$transaction(
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
    audit(req, "user.role.update", { userId: targetId }, { from: before, to: role });
    res.json(userToJson(user));
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/listings?q&status&limit&offset (annonces masquées comprises)
export async function listings(req, res, next) {
  try {
    const { q, status, limit, offset } = req.query;
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
      prisma.listing.findMany({
        where,
        include: {
          host: { select: { id: true, name: true, email: true, avatar: true } },
          _count: { select: { bookings: true, reviews: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.listing.count({ where }),
    ]);
    res.json({
      data: data.map(({ _count, ...l }) => ({
        ...listingToJson(l),
        bookingsCount: _count.bookings,
        reviewsCount: _count.reviews,
      })),
      total,
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/listings/:id/status { status: "ACTIVE" | "HIDDEN" }
export async function updateListingStatus(req, res, next) {
  try {
    const { status } = req.body;
    const existing = await prisma.listing.findUnique({ where: { id: req.params.id }, select: { status: true } });
    if (!existing) throw httpError(404, "Annonce introuvable");
    const listing = await prisma.listing.update({
      where: { id: req.params.id },
      data: { status },
      include: { host: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    audit(req, "listing.status.update", { listingId: listing.id }, { from: existing.status, to: status });
    res.json(listingToJson(listing));
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/reviews?limit&offset : avis les plus récents.
export async function reviews(req, res, next) {
  try {
    const { limit, offset } = req.query;
    const [data, total] = await Promise.all([
      prisma.review.findMany({
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
      prisma.review.count(),
    ]);
    res.json({ data, total, limit, offset });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/reviews/:id -> { listing: { id, rating, reviewCount } } (note recalculée)
export async function deleteReview(req, res, next) {
  try {
    const listing = await prisma.$transaction(async (tx) => {
      const review = await tx.review.findUnique({ where: { id: req.params.id }, select: { id: true, listingId: true } });
      if (!review) throw httpError(404, "Avis introuvable");
      await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${review.listingId} FOR UPDATE`;
      await tx.review.delete({ where: { id: review.id } });
      return recomputeListingRating(tx, review.listingId);
    });
    audit(req, "review.delete", { reviewId: req.params.id, listingId: listing.id });
    res.json({ listing });
  } catch (err) {
    next(err);
  }
}
