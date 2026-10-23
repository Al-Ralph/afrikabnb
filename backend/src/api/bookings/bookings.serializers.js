import { listingToJson } from "../listings/listings.serializers.js";
import { formatDay, nightsBetween, todayDay } from "../../utils/booking.js";
import { effectiveStatus, pendingExpiresAt } from "../../utils/bookingStatus.js";
import { PAYMENT_CURRENCY, payableAmount } from "../../utils/payment.js";

// Colonnes jamais renvoyées telles quelles : fiche de contact (exposée seulement par
// bookingWithContactToJson) et jeton d'accès sans compte (jamais exposé, même haché).
const PRIVATE_FIELDS = [
  "contactName",
  "contactEmail",
  "contactPhone",
  "contactCountry",
  "arrivalTime",
  "messageToHost",
  "guestAccessTokenHash",
  "guestAccessExpiresAt",
];

// `now` ignoré s'il n'est pas une Date (utilisable directement dans Array.prototype.map).
// Vue publique / voyageur : sans fiche de contact.
export function bookingToJson(booking, now) {
  if (!(now instanceof Date)) now = new Date();
  const { checkIn, checkOut, totalPrice, listing, review, ...rest } = booking;
  for (const field of PRIVATE_FIELDS) delete rest[field];
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
  // Paiement attendu ou effectué : montant exact facturé (XOF, arrondi exigé par le prestataire).
  if (booking.paymentStatus && booking.paymentStatus !== "NONE") {
    out.paymentAmount = payableAmount(totalPrice);
    out.paymentCurrency = PAYMENT_CURRENCY;
  }
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

// Fiche de contact saisie par le voyageur, ou null (réservations antérieures sans fiche).
export function contactOf(booking) {
  if (!booking.contactName && !booking.contactEmail) return null;
  return {
    name: booking.contactName ?? null,
    email: booking.contactEmail ?? null,
    phone: booking.contactPhone ?? null,
    country: booking.contactCountry ?? null,
    arrivalTime: booking.arrivalTime ?? null,
    message: booking.messageToHost ?? null,
  };
}

// Vue avec la fiche de contact : réservée à l'hôte de l'annonce et au voyageur connecté lui-même
// (l'appelant garantit cette autorisation). `guestAccount` : false = réservation sans compte.
export function bookingWithContactToJson(booking, now) {
  return { ...bookingToJson(booking, now), guestAccount: booking.guestId != null, contact: contactOf(booking) };
}
