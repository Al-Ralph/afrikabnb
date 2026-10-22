import { Prisma } from "@prisma/client";
import prisma from "../../config/db.js";
import { listingBaseInclude, listingToJson } from "../listings/listings.serializers.js";
import { httpError } from "../../utils/httpError.js";
import {
  MAX_AMOUNT,
  addDays,
  computeTotalPrice,
  formatDay,
  nightsBetween,
  parseDay,
  todayDay,
} from "../../utils/booking.js";
import {
  blockingBookingWhere,
  effectiveStatus,
  expiredPendingWhere,
  findStayConflict,
  nextStatus,
  pendingExpiresAt,
} from "../../utils/bookingStatus.js";
import { notifyBooking } from "./bookings.notifications.js";

const publicPerson = { select: { id: true, name: true, avatar: true } };

// Vue voyageur : annonce complète + présence d'un avis.
export const guestBookingInclude = {
  listing: { include: listingBaseInclude },
  review: { select: { id: true } },
};

// Vue hôte : voyageur (sans email) + résumé de l'annonce.
export const hostBookingInclude = {
  guest: publicPerson,
  listing: {
    select: { id: true, title: true, location: true, imageUrl: true, currency: true, instantBook: true },
  },
};

// `now` ignoré s'il n'est pas une Date (utilisable directement dans Array.prototype.map).
export function bookingToJson(booking, now) {
  if (!(now instanceof Date)) now = new Date();
  const { checkIn, checkOut, totalPrice, listing, review, ...rest } = booking;
  const status = effectiveStatus(booking, now);
  const out = {
    ...rest,
    status,
    checkIn: formatDay(checkIn),
    checkOut: formatDay(checkOut),
    nights: nightsBetween(formatDay(checkIn), formatDay(checkOut)),
    totalPrice: Number(totalPrice),
    // Date limite de réponse de l'hôte (demandes en attente uniquement).
    expiresAt: status === "PENDING" ? pendingExpiresAt(booking.createdAt).toISOString() : null,
  };
  if (listing) {
    out.currency = listing.currency;
    out.listing = listingToJson(listing);
  }
  if (review !== undefined) {
    out.hasReview = review != null;
    out.canReview = review == null && status === "CONFIRMED" && out.checkOut <= todayDay(now);
  }
  return out;
}

// Persistance paresseuse des demandes expirées (voir utils/bookingStatus.js).
export function sweepExpired(where) {
  return prisma.booking.updateMany({ where: { ...where, ...expiredPendingWhere() }, data: { status: "EXPIRED" } });
}

// Réservations et périodes bloquées qui pourraient chevaucher [start, end[ (à affiner par findStayConflict).
async function overlapping(tx, listingId, start, end) {
  const [bookings, blockedPeriods] = await Promise.all([
    tx.booking.findMany({
      where: { listingId, status: { in: ["PENDING", "CONFIRMED"] }, checkIn: { lt: end }, checkOut: { gt: start } },
      select: { id: true, status: true, createdAt: true, checkIn: true, checkOut: true },
    }),
    tx.blockedPeriod.findMany({
      where: { listingId, startDate: { lt: end }, endDate: { gt: start } },
      select: { id: true, startDate: true, endDate: true },
    }),
  ]);
  return { bookings, blockedPeriods };
}

// POST /api/listings/:id/bookings
// Réservation instantanée (instantBook) -> CONFIRMED ; sinon demande PENDING à valider par l'hôte.
export async function create(req, res, next) {
  try {
    const { checkIn, checkOut, guests } = req.body;
    const listingId = req.params.id;
    const nights = nightsBetween(checkIn, checkOut);
    const start = parseDay(checkIn);
    const end = parseDay(checkOut);

    const booking = await prisma.$transaction(async (tx) => {
      // Verrou de la ligne Listing : deux réservations concurrentes de la même annonce sont
      // sérialisées, le contrôle de chevauchement ci-dessous ne peut donc pas être contourné.
      const rows = await tx.$queryRaw`
        SELECT "id", "hostId", "pricePerNight", "maxGuests", "instantBook", "status"::text AS "status"
        FROM "Listing" WHERE "id" = ${listingId} FOR UPDATE`;
      const listing = rows[0];
      if (!listing || listing.status !== "ACTIVE") throw httpError(404, "Annonce introuvable");
      if (listing.hostId === req.user.id) {
        throw httpError(403, "Impossible de réserver sa propre annonce");
      }
      if (guests > Number(listing.maxGuests)) {
        throw httpError(400, `Capacité maximale dépassée (${listing.maxGuests} voyageurs)`);
      }
      const totalPrice = computeTotalPrice(listing.pricePerNight, nights);
      if (totalPrice > MAX_AMOUNT) throw httpError(400, "Montant total trop élevé");

      const candidates = await overlapping(tx, listingId, start, end);
      if (findStayConflict({ checkIn, checkOut, ...candidates })) {
        throw httpError(409, "Ces dates ne sont pas disponibles");
      }

      return tx.booking.create({
        data: {
          listingId,
          guestId: req.user.id,
          checkIn: start,
          checkOut: end,
          guests,
          totalPrice: new Prisma.Decimal(totalPrice.toFixed(2)),
          status: listing.instantBook ? "CONFIRMED" : "PENDING",
        },
        include: guestBookingInclude,
      });
    });
    res.status(201).json(bookingToJson(booking));
    notifyBooking("created", booking.id, req.log);
  } catch (err) {
    next(err);
  }
}

// GET /api/listings/:id/availability?from&to : nuits indisponibles, sans information personnelle.
// `booked` : réservations bloquantes ET périodes bloquées par l'hôte (compatibilité : un calendrier
// qui ne lit que `booked` désactive toutes les nuits indisponibles) ; `blocked` : blocages seuls.
export async function availability(req, res, next) {
  try {
    const from = req.query.from ?? todayDay();
    const to = req.query.to ?? addDays(from, 365);
    if (to <= from) return res.status(400).json({ error: "`to` doit être postérieur à `from`" });
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });
    if (!listing || listing.status !== "ACTIVE") return res.status(404).json({ error: "Annonce introuvable" });
    const [bookings, blocked] = await Promise.all([
      prisma.booking.findMany({
        where: {
          listingId: listing.id,
          ...blockingBookingWhere(),
          checkIn: { lt: parseDay(to) },
          checkOut: { gt: parseDay(from) },
        },
        select: { checkIn: true, checkOut: true },
      }),
      prisma.blockedPeriod.findMany({
        where: { listingId: listing.id, startDate: { lt: parseDay(to) }, endDate: { gt: parseDay(from) } },
        select: { startDate: true, endDate: true },
      }),
    ]);
    const blockedRanges = blocked.map((p) => ({ checkIn: formatDay(p.startDate), checkOut: formatDay(p.endDate) }));
    const booked = [
      ...bookings.map((b) => ({ checkIn: formatDay(b.checkIn), checkOut: formatDay(b.checkOut) })),
      ...blockedRanges,
    ].sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0));
    res.json({
      listingId: listing.id,
      from,
      to,
      booked,
      blocked: blockedRanges.map((r) => ({ startDate: r.checkIn, endDate: r.checkOut })),
    });
  } catch (err) {
    next(err);
  }
}

// Applique une transition (cancel / confirm / decline) dans une transaction.
// allowed(booking, user) -> message d'erreur 403 ou null.
async function transition(req, action, allowed) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.booking.findUnique({
      where: { id: req.params.id },
      include: { listing: { select: { hostId: true } } },
    });
    if (!found) throw httpError(404, "Réservation introuvable");
    const forbidden = allowed(found, req.user);
    if (forbidden) throw httpError(403, forbidden);
    // Verrou de l'annonce, puis relecture : état à jour sous verrou.
    await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${found.listingId} FOR UPDATE`;
    const booking = await tx.booking.findUnique({ where: { id: found.id } });
    const result = nextStatus(booking, action);
    if (!result.ok) {
      if (result.expired && booking.status === "PENDING") {
        await tx.booking.update({ where: { id: booking.id }, data: { status: "EXPIRED" } });
      }
      return { error: result };
    }
    if (result.unchanged) return { booking, changed: false, by: found.guestId === req.user.id ? "guest" : "host" };
    if (result.status === "CONFIRMED") {
      // Garde-fou : les dates d'une demande PENDING sont déjà réservées, sauf incohérence.
      const candidates = await overlapping(tx, booking.listingId, booking.checkIn, booking.checkOut);
      if (findStayConflict({ checkIn: booking.checkIn, checkOut: booking.checkOut, ...candidates, excludeBookingId: booking.id })) {
        throw httpError(409, "Ces dates ne sont plus disponibles");
      }
    }
    await tx.booking.update({ where: { id: booking.id }, data: { status: result.status } });
    return { booking, changed: true, by: found.guestId === req.user.id ? "guest" : "host" };
  });
}

async function respond(req, res, outcome) {
  // Erreur métier levée après la persistance éventuelle de EXPIRED (commit effectué).
  if (outcome.error) return res.status(outcome.error.code).json({ error: outcome.error.error });
  const updated = await prisma.booking.findUnique({
    where: { id: outcome.booking.id },
    include: { ...guestBookingInclude, guest: publicPerson },
  });
  res.json(bookingToJson(updated));
}

// PATCH /api/bookings/:id/cancel : par le voyageur ou l'hôte de l'annonce.
export async function cancel(req, res, next) {
  try {
    const outcome = await transition(req, "cancel", (b, user) =>
      b.guestId !== user.id && b.listing.hostId !== user.id ? "Non autorisé à annuler cette réservation" : null
    );
    await respond(req, res, outcome);
    if (outcome.changed) notifyBooking("cancelled", outcome.booking.id, req.log, { cancelledBy: outcome.by });
  } catch (err) {
    next(err);
  }
}

const hostOnly = (b, user) => (b.listing.hostId !== user.id ? "Seul l'hôte peut répondre à cette demande" : null);

// PATCH /api/bookings/:id/confirm : l'hôte accepte une demande PENDING (non expirée).
export async function confirm(req, res, next) {
  try {
    const outcome = await transition(req, "confirm", hostOnly);
    await respond(req, res, outcome);
    if (outcome.changed) notifyBooking("accepted", outcome.booking.id, req.log);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/bookings/:id/decline : l'hôte refuse une demande PENDING (non expirée).
export async function decline(req, res, next) {
  try {
    const outcome = await transition(req, "decline", hostOnly);
    await respond(req, res, outcome);
    if (outcome.changed) notifyBooking("declined", outcome.booking.id, req.log);
  } catch (err) {
    next(err);
  }
}

// GET /api/users/me/bookings : réservations du voyageur connecté.
export async function listMine(req, res, next) {
  try {
    await sweepExpired({ guestId: req.user.id });
    const bookings = await prisma.booking.findMany({
      where: { guestId: req.user.id },
      include: guestBookingInclude,
      orderBy: { checkIn: "desc" },
    });
    res.json({ data: bookings.map((b) => bookingToJson(b)) });
  } catch (err) {
    next(err);
  }
}
