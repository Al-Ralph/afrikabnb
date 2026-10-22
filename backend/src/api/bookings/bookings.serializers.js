import { listingToJson } from "../listings/listings.serializers.js";
import { formatDay, nightsBetween, todayDay } from "../../utils/booking.js";
import { effectiveStatus, pendingExpiresAt } from "../../utils/bookingStatus.js";

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
