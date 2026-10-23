import * as bookingsService from "../../services/bookings.js";
import { bookingToJson, bookingWithContactToJson } from "./bookings.serializers.js";
import { notifyBooking } from "./bookings.notifications.js";
import { handleSyncOutcome } from "../payments/payments.notifications.js";
import { appLink } from "../../services/email/index.js";

// Lien de suivi d'une réservation sans compte (page frontend /reservation/:token).
export const guestManageUrl = (token) => appLink(`/reservation/${token}`);

// POST /api/listings/:id/bookings (authentification facultative)
// Connecté : réservation instantanée (instantBook) -> CONFIRMED ; sinon demande PENDING.
// Sans compte : toujours PENDING ; la réponse contient `manageUrl` (lien de suivi, aussi envoyé
// par e-mail) pour l'afficher sur l'écran de confirmation du même navigateur.
export async function create(req, res, next) {
  try {
    const { checkIn, checkOut, guests, contact } = req.body;
    const { booking, accessToken } = await bookingsService.createBooking({
      listingId: req.params.id,
      user: req.userId ? { id: req.userId } : null,
      checkIn,
      checkOut,
      guests,
      contact,
    });
    const body = bookingWithContactToJson(booking);
    if (accessToken) {
      body.manageUrl = guestManageUrl(accessToken);
      res.set("Cache-Control", "no-store");
    }
    res.status(201).json(body);
    notifyBooking("created", booking.id, req.log, accessToken ? { manageUrl: body.manageUrl } : {});
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
    res.json(bookingWithContactToJson(outcome.booking));
    if (outcome.changed) {
      notifyBooking("cancelled", outcome.booking.id, req.log, { cancelledBy: outcome.by, refundDue: outcome.refundDue });
    }
  } catch (err) {
    next(err);
  }
}

// PATCH /api/bookings/:id/confirm : l'hôte accepte une demande PENDING (non expirée).
export async function confirm(req, res, next) {
  try {
    const outcome = await bookingsService.confirmBooking({ bookingId: req.params.id, user: req.user });
    res.json(bookingWithContactToJson(outcome.booking));
    if (outcome.changed) notifyBooking("accepted", outcome.booking.id, req.log);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/bookings/:id/decline : l'hôte refuse une demande PENDING (non expirée).
export async function decline(req, res, next) {
  try {
    const outcome = await bookingsService.declineBooking({ bookingId: req.params.id, user: req.user });
    res.json(bookingWithContactToJson(outcome.booking));
    if (outcome.changed) notifyBooking("declined", outcome.booking.id, req.log);
  } catch (err) {
    next(err);
  }
}

// GET /api/users/me/bookings : réservations du voyageur connecté.
export async function listMine(req, res, next) {
  try {
    const { bookings, unpaidCancelled } = await bookingsService.listGuestBookings(req.user.id, undefined, {
      onSync: (result) => handleSyncOutcome(result, req.log),
    });
    res.json({ data: bookings.map((b) => bookingWithContactToJson(b)) });
    for (const id of unpaidCancelled) notifyBooking("unpaid", id, req.log);
  } catch (err) {
    next(err);
  }
}

// GET /api/guest-bookings/:token : suivi d'une réservation sans compte (sans fiche de contact).
export async function getGuest(req, res, next) {
  try {
    res.json(bookingToJson(await bookingsService.getGuestBooking({ token: req.params.token })));
  } catch (err) {
    next(err);
  }
}

// POST /api/guest-bookings/:token/cancel : annulation par le voyageur sans compte.
export async function cancelGuest(req, res, next) {
  try {
    const outcome = await bookingsService.cancelGuestBooking({ token: req.params.token });
    res.json(bookingToJson(outcome.booking));
    if (outcome.changed) {
      notifyBooking("cancelled", outcome.booking.id, req.log, { cancelledBy: "guest", refundDue: outcome.refundDue });
    }
  } catch (err) {
    next(err);
  }
}
