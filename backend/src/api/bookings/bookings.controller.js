import * as bookingsService from "../../services/bookings.js";
import { bookingToJson } from "./bookings.serializers.js";
import { notifyBooking } from "./bookings.notifications.js";

// POST /api/listings/:id/bookings
// Réservation instantanée (instantBook) -> CONFIRMED ; sinon demande PENDING à valider par l'hôte.
export async function create(req, res, next) {
  try {
    const { checkIn, checkOut, guests } = req.body;
    const booking = await bookingsService.createBooking({
      listingId: req.params.id,
      user: req.user,
      checkIn,
      checkOut,
      guests,
    });
    res.status(201).json(bookingToJson(booking));
    notifyBooking("created", booking.id, req.log);
  } catch (err) {
    next(err);
  }
}

// GET /api/listings/:id/availability?from&to : nuits indisponibles, sans information personnelle.
export async function availability(req, res, next) {
  try {
    res.json(await bookingsService.getAvailability({ listingId: req.params.id, from: req.query.from, to: req.query.to }));
  } catch (err) {
    next(err);
  }
}

// PATCH /api/bookings/:id/cancel : par le voyageur ou l'hôte de l'annonce.
export async function cancel(req, res, next) {
  try {
    const outcome = await bookingsService.cancelBooking({ bookingId: req.params.id, user: req.user });
    res.json(bookingToJson(outcome.booking));
    if (outcome.changed) notifyBooking("cancelled", outcome.booking.id, req.log, { cancelledBy: outcome.by });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/bookings/:id/confirm : l'hôte accepte une demande PENDING (non expirée).
export async function confirm(req, res, next) {
  try {
    const outcome = await bookingsService.confirmBooking({ bookingId: req.params.id, user: req.user });
    res.json(bookingToJson(outcome.booking));
    if (outcome.changed) notifyBooking("accepted", outcome.booking.id, req.log);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/bookings/:id/decline : l'hôte refuse une demande PENDING (non expirée).
export async function decline(req, res, next) {
  try {
    const outcome = await bookingsService.declineBooking({ bookingId: req.params.id, user: req.user });
    res.json(bookingToJson(outcome.booking));
    if (outcome.changed) notifyBooking("declined", outcome.booking.id, req.log);
  } catch (err) {
    next(err);
  }
}

// GET /api/users/me/bookings : réservations du voyageur connecté.
export async function listMine(req, res, next) {
  try {
    const bookings = await bookingsService.listGuestBookings(req.user.id);
    res.json({ data: bookings.map((b) => bookingToJson(b)) });
  } catch (err) {
    next(err);
  }
}
