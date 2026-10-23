// Avis des voyageurs et note moyenne des annonces.
// Sans req/res : erreurs métier levées via httpError, client Prisma injectable (`db`).
import prisma from "../config/db.js";
import { httpError } from "../utils/httpError.js";
import { averageRating, formatDay, todayDay } from "../utils/booking.js";

const authorSelect = { select: { id: true, name: true, avatar: true } };
const reviewSelect = { id: true, rating: true, comment: true, createdAt: true, author: authorSelect };

// Recalcule la note moyenne et le nombre d'avis d'une annonce (dans une transaction ayant
// verrouillé la ligne Listing). Retourne { id, rating, reviewCount }.
export async function recomputeListingRating(tx, listingId) {
  const agg = await tx.review.aggregate({
    where: { listingId },
    _sum: { rating: true },
    _count: { _all: true },
  });
  const reviewCount = agg._count._all;
  const rating = averageRating(agg._sum.rating, reviewCount);
  await tx.listing.update({ where: { id: listingId }, data: { rating, reviewCount } });
  return { id: listingId, rating, reviewCount };
}

// Avis d'une annonce, paginés -> { data, total, rating, reviewCount }.
export async function listListingReviews({ listingId, limit, offset }, db = prisma) {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true, rating: true, reviewCount: true },
  });
  if (!listing) throw httpError(404, "Annonce introuvable");
  const [data, total] = await Promise.all([
    db.review.findMany({
      where: { listingId: listing.id },
      select: reviewSelect,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.review.count({ where: { listingId: listing.id } }),
  ]);
  return {
    data,
    total,
    rating: listing.rating != null ? Number(listing.rating) : null,
    reviewCount: listing.reviewCount,
  };
}

// Un avis par séjour terminé, par le voyageur uniquement -> { review, listing: { id, rating, reviewCount } }.
export function createReview({ bookingId, user, rating, comment }, db = prisma) {
  return db.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { review: { select: { id: true } } },
    });
    if (!booking) throw httpError(404, "Réservation introuvable");
    if (booking.guestId !== user.id) {
      throw httpError(403, "Seul le voyageur de cette réservation peut laisser un avis");
    }
    if (booking.status !== "CONFIRMED") {
      throw httpError(400, "Seule une réservation confirmée peut recevoir un avis");
    }
    if (formatDay(booking.checkOut) > todayDay()) {
      throw httpError(400, "L'avis est possible après la date de départ");
    }
    if (booking.review) throw httpError(409, "Un avis existe déjà pour ce séjour");

    // Verrou de l'annonce : la moyenne est recalculée sans course avec un autre avis.
    await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${booking.listingId} FOR UPDATE`;
    const review = await tx.review.create({
      data: {
        listingId: booking.listingId,
        authorId: user.id,
        bookingId: booking.id,
        rating,
        comment,
      },
      select: reviewSelect,
    });
    const listing = await recomputeListingRating(tx, booking.listingId);
    return { review, listing };
  });
}
