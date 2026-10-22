import prisma from "../../config/db.js";
import { httpError } from "../../utils/httpError.js";
import { formatDay, parseDay } from "../../utils/booking.js";
import { findStayConflict } from "../../utils/bookingStatus.js";

// Vue propriétaire (avec la raison, privée).
export function blockedPeriodToJson(p) {
  return {
    id: p.id,
    listingId: p.listingId,
    startDate: formatDay(p.startDate),
    endDate: formatDay(p.endDate),
    reason: p.reason,
    createdAt: p.createdAt,
  };
}

async function assertOwner(listingId, userId, client = prisma) {
  const listing = await client.listing.findUnique({ where: { id: listingId }, select: { hostId: true } });
  if (!listing) throw httpError(404, "Annonce introuvable");
  if (listing.hostId !== userId) throw httpError(403, "Non autorisé à gérer cette annonce");
}

// GET /api/listings/:id/blocked-periods (propriétaire) : périodes en cours ou à venir par défaut.
export async function list(req, res, next) {
  try {
    await assertOwner(req.params.id, req.user.id);
    const where = { listingId: req.params.id };
    if (req.query.from) where.endDate = { gt: parseDay(req.query.from) };
    const periods = await prisma.blockedPeriod.findMany({ where, orderBy: { startDate: "asc" } });
    res.json({ data: periods.map(blockedPeriodToJson) });
  } catch (err) {
    next(err);
  }
}

// POST /api/listings/:id/blocked-periods { startDate, endDate, reason? } -> 201
// 409 si la période chevauche une réservation bloquante (CONFIRMED ou PENDING non expirée) :
// l'hôte doit d'abord l'annuler ou la refuser.
export async function create(req, res, next) {
  try {
    const { startDate, endDate, reason } = req.body;
    const listingId = req.params.id;
    const period = await prisma.$transaction(async (tx) => {
      // Même verrou que la création de réservation : pas de course réservation / blocage.
      const rows = await tx.$queryRaw`SELECT "hostId" FROM "Listing" WHERE "id" = ${listingId} FOR UPDATE`;
      if (!rows[0]) throw httpError(404, "Annonce introuvable");
      if (rows[0].hostId !== req.user.id) throw httpError(403, "Non autorisé à gérer cette annonce");
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
    res.status(201).json(blockedPeriodToJson(period));
  } catch (err) {
    next(err);
  }
}

// DELETE /api/listings/:id/blocked-periods/:periodId -> 204
export async function remove(req, res, next) {
  try {
    await assertOwner(req.params.id, req.user.id);
    const { count } = await prisma.blockedPeriod.deleteMany({
      where: { id: req.params.periodId, listingId: req.params.id },
    });
    if (count === 0) return res.status(404).json({ error: "Période introuvable" });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
