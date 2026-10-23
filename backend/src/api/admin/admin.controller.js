import * as adminService from "../../services/admin.js";
import * as paymentsService from "../../services/payments.js";
import { formatDay } from "../../utils/booking.js";
import { listingToJson } from "../listings/listings.serializers.js";

// Journal des actions d'administration (qui, quoi, sur quelle cible).
function audit(req, action, target, details = {}) {
  req.log.info({ adminId: req.user.id, action, target, ...details }, `[admin] ${action}`);
}

const userToJson = ({ _count, ...u }) => ({ ...u, listingsCount: _count.listings, bookingsCount: _count.bookings });

// GET /api/admin/stats
export async function stats(req, res, next) {
  try {
    res.json(await adminService.getStats());
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/users?q&role&limit&offset
export async function users(req, res, next) {
  try {
    const { limit, offset } = req.query;
    const { data, total } = await adminService.listUsers(req.query);
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
    const { before, user } = await adminService.updateUserRole({ actor: req.user, targetId, role });
    audit(req, "user.role.update", { userId: targetId }, { from: before, to: role });
    res.json(userToJson(user));
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/listings?q&status&limit&offset (annonces masquées comprises)
export async function listings(req, res, next) {
  try {
    const { limit, offset } = req.query;
    const { data, total } = await adminService.listListings(req.query);
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
    const { before, listing } = await adminService.updateListingStatus({ listingId: req.params.id, status });
    audit(req, "listing.status.update", { listingId: listing.id }, { from: before, to: status });
    res.json(listingToJson(listing));
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/reviews?limit&offset : avis les plus récents.
export async function reviews(req, res, next) {
  try {
    const { limit, offset } = req.query;
    const { data, total } = await adminService.listReviews({ limit, offset });
    res.json({ data, total, limit, offset });
  } catch (err) {
    next(err);
  }
}

// Réservation à rembourser -> JSON (montants numériques, jours "YYYY-MM-DD").
const refundToJson = ({ totalPrice, checkIn, checkOut, contactName, contactEmail, guest, payments, ...b }) => ({
  ...b,
  totalPrice: Number(totalPrice),
  checkIn: formatDay(checkIn),
  checkOut: formatDay(checkOut),
  traveler: guest ? { name: guest.name, email: guest.email, account: true } : { name: contactName, email: contactEmail, account: false },
  payments: (payments || []).map((p) => ({ ...p, amount: Number(p.amount) })),
});

// Paiement à rembourser isolément (doublon, montant discordant) -> JSON.
const paymentRefundToJson = ({ amount, booking, ...p }) => ({
  ...p,
  amount: Number(amount),
  booking: booking
    ? {
        id: booking.id,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        checkIn: formatDay(booking.checkIn),
        checkOut: formatDay(booking.checkOut),
        listing: booking.listing,
        traveler: booking.guest
          ? { name: booking.guest.name, email: booking.guest.email, account: true }
          : { name: booking.contactName, email: booking.contactEmail, account: false },
      }
    : null,
});

// GET /api/admin/refunds?status=REFUND_DUE|REFUNDED&limit&offset
export async function refunds(req, res, next) {
  try {
    const { status, limit, offset } = req.query;
    const { data, total, payments } = await paymentsService.listRefunds({ status, limit, offset });
    res.json({ data: data.map(refundToJson), total, limit, offset, payments: payments.map(paymentRefundToJson) });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/bookings/:id/refunded : remboursement effectué hors application.
export async function markRefunded(req, res, next) {
  try {
    const booking = await paymentsService.markRefunded(req.params.id);
    audit(req, "booking.refund.done", { bookingId: req.params.id });
    res.json(refundToJson(booking));
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/payments/:id/refunded : paiement isolé remboursé hors application.
export async function markPaymentRefunded(req, res, next) {
  try {
    const payment = await paymentsService.markPaymentRefunded(req.params.id);
    audit(req, "payment.refund.done", { paymentId: req.params.id, transactionId: payment.transactionId });
    res.json(paymentRefundToJson(payment));
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/reviews/:id -> { listing: { id, rating, reviewCount } } (note recalculée)
export async function deleteReview(req, res, next) {
  try {
    const listing = await adminService.deleteReview(req.params.id);
    audit(req, "review.delete", { reviewId: req.params.id, listingId: listing.id });
    res.json({ listing });
  } catch (err) {
    next(err);
  }
}
