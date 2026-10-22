import { Prisma } from "@prisma/client";
import prisma from "../../config/db.js";
import { hostSelect, listingToJson } from "../listings/listings.serializers.js";
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

const publicPerson = { select: { id: true, name: true, avatar: true } };

// Vue voyageur : annonce complète + présence d'un avis.
export const guestBookingInclude = {
  listing: { include: { host: hostSelect } },
  review: { select: { id: true } },
};

// Vue hôte : voyageur (sans email) + résumé de l'annonce.
export const hostBookingInclude = {
  guest: publicPerson,
  listing: {
    select: { id: true, title: true, location: true, imageUrl: true, currency: true },
  },
};

const activeStatus = { not: "CANCELLED" };

export function bookingToJson(booking) {
  const { checkIn, checkOut, totalPrice, listing, review, ...rest } = booking;
  const out = {
    ...rest,
    checkIn: formatDay(checkIn),
    checkOut: formatDay(checkOut),
    nights: nightsBetween(formatDay(checkIn), formatDay(checkOut)),
    totalPrice: Number(totalPrice),
  };
  if (listing) {
    out.currency = listing.currency;
    out.listing = listingToJson(listing);
  }
  if (review !== undefined) {
    out.hasReview = review != null;
    out.canReview =
      review == null && booking.status === "CONFIRMED" && out.checkOut <= todayDay();
  }
  return out;
}

// POST /api/listings/:id/bookings
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
        SELECT "id", "hostId", "pricePerNight", "maxGuests" FROM "Listing" WHERE "id" = ${listingId} FOR UPDATE`;
      const listing = rows[0];
      if (!listing) throw httpError(404, "Annonce introuvable");
      if (listing.hostId === req.user.id) {
        throw httpError(403, "Impossible de réserver sa propre annonce");
      }
      if (guests > Number(listing.maxGuests)) {
        throw httpError(400, `Capacité maximale dépassée (${listing.maxGuests} voyageurs)`);
      }
      const totalPrice = computeTotalPrice(listing.pricePerNight, nights);
      if (totalPrice > MAX_AMOUNT) throw httpError(400, "Montant total trop élevé");

      const conflict = await tx.booking.findFirst({
        where: { listingId, status: activeStatus, checkIn: { lt: end }, checkOut: { gt: start } },
        select: { id: true },
      });
      if (conflict) throw httpError(409, "Ces dates ne sont pas disponibles");

      return tx.booking.create({
        data: {
          listingId,
          guestId: req.user.id,
          checkIn: start,
          checkOut: end,
          guests,
          totalPrice: new Prisma.Decimal(totalPrice.toFixed(2)),
          status: "CONFIRMED",
        },
        include: guestBookingInclude,
      });
    });
    res.status(201).json(bookingToJson(booking));
  } catch (err) {
    next(err);
  }
}

// GET /api/listings/:id/availability?from&to : plages occupées, sans information personnelle.
export async function availability(req, res, next) {
  try {
    const from = req.query.from ?? todayDay();
    const to = req.query.to ?? addDays(from, 365);
    if (to <= from) return res.status(400).json({ error: "`to` doit être postérieur à `from`" });
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!listing) return res.status(404).json({ error: "Annonce introuvable" });
    const bookings = await prisma.booking.findMany({
      where: {
        listingId: listing.id,
        status: activeStatus,
        checkIn: { lt: parseDay(to) },
        checkOut: { gt: parseDay(from) },
      },
      select: { checkIn: true, checkOut: true },
      orderBy: { checkIn: "asc" },
    });
    res.json({
      listingId: listing.id,
      from,
      to,
      booked: bookings.map((b) => ({ checkIn: formatDay(b.checkIn), checkOut: formatDay(b.checkOut) })),
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/bookings/:id/cancel : par le voyageur ou l'hôte de l'annonce.
export async function cancel(req, res, next) {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: { listing: { select: { hostId: true } } },
    });
    if (!booking) return res.status(404).json({ error: "Réservation introuvable" });
    if (booking.guestId !== req.user.id && booking.listing.hostId !== req.user.id) {
      return res.status(403).json({ error: "Non autorisé à annuler cette réservation" });
    }
    if (booking.status !== "CANCELLED") {
      if (formatDay(booking.checkIn) <= todayDay()) {
        return res.status(409).json({ error: "Le séjour a déjà commencé" });
      }
      await prisma.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });
    }
    const updated = await prisma.booking.findUnique({
      where: { id: booking.id },
      include: guestBookingInclude,
    });
    res.json(bookingToJson(updated));
  } catch (err) {
    next(err);
  }
}

// GET /api/users/me/bookings : réservations du voyageur connecté.
export async function listMine(req, res, next) {
  try {
    const bookings = await prisma.booking.findMany({
      where: { guestId: req.user.id },
      include: guestBookingInclude,
      orderBy: { checkIn: "desc" },
    });
    res.json({ data: bookings.map(bookingToJson) });
  } catch (err) {
    next(err);
  }
}
