// Dates bloquées par l'hôte (propriétaire uniquement).
// Sans req/res : erreurs métier levées via httpError, client Prisma injectable (`db`).
import prisma from "../config/db.js";
import { httpError } from "../utils/httpError.js";
import { parseDay } from "../utils/booking.js";
import { findStayConflict } from "../utils/bookingStatus.js";

async function assertOwner(listingId, userId, db) {
  const listing = await db.listing.findUnique({ where: { id: listingId }, select: { hostId: true } });
  if (!listing) throw httpError(404, "Annonce introuvable");
  if (listing.hostId !== userId) throw httpError(403, "Non autorisé à gérer cette annonce");
}

// Périodes de l'annonce (celles qui finissent après `from` si fourni).
export async function listBlockedPeriods({ listingId, userId, from }, db = prisma) {
  await assertOwner(listingId, userId, db);
  const where = { listingId };
  if (from) where.endDate = { gt: parseDay(from) };
  return db.blockedPeriod.findMany({ where, orderBy: { startDate: "asc" } });
}

// 409 si la période chevauche une réservation bloquante (CONFIRMED ou PENDING non expirée) :
// l'hôte doit d'abord l'annuler ou la refuser.
export function createBlockedPeriod({ listingId, userId, startDate, endDate, reason }, db = prisma) {
  return db.$transaction(async (tx) => {
    // Même verrou que la création de réservation : pas de course réservation / blocage.
    const rows = await tx.$queryRaw`SELECT "hostId" FROM "Listing" WHERE "id" = ${listingId} FOR UPDATE`;
    if (!rows[0]) throw httpError(404, "Annonce introuvable");
    if (rows[0].hostId !== userId) throw httpError(403, "Non autorisé à gérer cette annonce");
    const bookings = await tx.booking.findMany({
      where: {
        listingId,
        status: { in: ["PENDING", "CONFIRMED"] },
        checkIn: { lt: parseDay(endDate) },
        checkOut: { gt: parseDay(startDate) },
      },
      select: { id: true, status: true, createdAt: true, checkIn: true, checkOut: true },
    });
    if (findStayConflict({ checkIn: startDate, checkOut: endDate, bookings })) {
      throw httpError(409, "Des réservations existent sur ces dates");
    }
    return tx.blockedPeriod.create({
      data: { listingId, startDate: parseDay(startDate), endDate: parseDay(endDate), reason: reason || null },
    });
  });
}

export async function removeBlockedPeriod({ listingId, periodId, userId }, db = prisma) {
  await assertOwner(listingId, userId, db);
  const { count } = await db.blockedPeriod.deleteMany({ where: { id: periodId, listingId } });
  if (count === 0) throw httpError(404, "Période introuvable");
}
