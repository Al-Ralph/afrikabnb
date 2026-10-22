import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { api } from "../../api/client";
import { formatPrice, formatDay } from "../../utils/format";
import { interpolate } from "../../utils/plural";
import { apiErrorMessage } from "./errorMessage";
import ReviewForm from "./ReviewForm";

// Échéance de réponse de l'hôte (ISO) -> « 24 oct. 2026, 14:30 ».
function formatDeadline(iso, language) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

// kind : "upcoming" | "past" | "cancelled" ; today : "YYYY-MM-DD".
const BookingItem = ({ booking, kind, today, onChange }) => {
  const { t, language } = useLanguage();
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const listing = booking.listing || {};
  const listingId = booking.listingId || listing.id;
  const nights = Number(booking.nights) || 0;
  const guests = Number(booking.guests) || 0;
  const status = booking.status;
  const isPending = status === "PENDING";
  // Annulable : demande en attente ou réservation confirmée, avant l'arrivée.
  const canCancel =
    kind === "upcoming" && (isPending || status === "CONFIRMED") && booking.checkIn > today;
  const deadline = isPending ? formatDeadline(booking.expiresAt, language) : "";
  const canReview =
    kind === "past" &&
    booking.status === "CONFIRMED" &&
    (booking.canReview !== undefined ? booking.canReview : !booking.hasReview);

  const handleCancel = async () => {
    setError("");
    setCancelling(true);
    try {
      const updated = await api.cancelBooking(booking.id);
      setConfirming(false);
      onChange({ ...booking, ...updated, listing: updated.listing || booking.listing });
    } catch (err) {
      setError(
        err?.status === 409 ? t("bookings.cancelStarted") : apiErrorMessage(err, t("bookings.cancelError"))
      );
    } finally {
      setCancelling(false);
    }
  };

  const markReviewed = (message) => {
    setReviewOpen(false);
    setNotice(message);
    onChange({ ...booking, hasReview: true, canReview: false });
  };

  return (
    <li className="booking-item">
      <Link to={`/property/${listingId}`} className="booking-item-photo" tabIndex={-1} aria-hidden="true">
        {listing.image && <img src={listing.image} alt="" loading="lazy" />}
      </Link>
      <div className="booking-item-body">
        <div className="booking-item-head">
          <h4 className="booking-item-title">
            <Link to={`/property/${listingId}`}>{listing.title}</Link>
          </h4>
          <span className={`booking-status booking-status--${String(status).toLowerCase()}`}>
            {t(`bookingStatus.${status}`)}
          </span>
        </div>
        {listing.location && <p className="booking-item-location">{listing.location}</p>}
        <p className="booking-item-dates">
          {formatDay(booking.checkIn, language)} → {formatDay(booking.checkOut, language)}
          {nights > 0 && ` · ${nights} ${nights > 1 ? t("bookings.nights") : t("bookings.night")}`}
          {` · ${guests} ${guests > 1 ? t("bookings.guests") : t("bookings.guest")}`}
        </p>
        <p className="booking-item-total">
          <span>{t("bookings.total")}</span>{" "}
          <strong>{formatPrice(booking.totalPrice, booking.currency || listing.currency, language)}</strong>
        </p>
        {isPending && deadline && (
          <p className="booking-item-hint">{interpolate(t("bookingStatus.pendingUntil"), { date: deadline })}</p>
        )}
        {status === "DECLINED" && <p className="booking-item-hint">{t("bookingStatus.declinedHint")}</p>}
        {status === "EXPIRED" && <p className="booking-item-hint">{t("bookingStatus.expiredHint")}</p>}
        {booking.hasReview && !notice && <p className="booking-item-reviewed">{t("bookings.reviewed")}</p>}
        {notice && <p className="account-alert account-alert-success" role="status">{notice}</p>}
        {error && <p className="account-alert account-alert-error" role="alert">{error}</p>}

        {canCancel && !confirming && (
          <div className="profile-actions">
            <button type="button" className="account-btn account-btn-danger" onClick={() => setConfirming(true)}>
              {isPending ? t("bookingStatus.cancelRequest") : t("bookings.cancel")}
            </button>
          </div>
        )}
        {canCancel && confirming && (
          <div className="booking-confirm" role="group" aria-labelledby={`booking-confirm-${booking.id}`}>
            <p id={`booking-confirm-${booking.id}`}>
              {isPending ? t("bookingStatus.cancelRequestConfirm") : t("bookings.cancelConfirm")}
            </p>
            <div className="profile-actions">
              <button type="button" className="account-btn account-btn-danger" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? t("bookings.cancelling") : t("bookings.cancelYes")}
              </button>
              <button type="button" className="account-btn" onClick={() => setConfirming(false)} disabled={cancelling}>
                {t("bookings.cancelNo")}
              </button>
            </div>
          </div>
        )}

        {canReview && !reviewOpen && (
          <div className="profile-actions">
            <button type="button" className="account-btn" onClick={() => setReviewOpen(true)}>
              {t("bookings.leaveReview")}
            </button>
          </div>
        )}
        {canReview && reviewOpen && (
          <ReviewForm
            bookingId={booking.id}
            onReviewed={() => markReviewed(t("bookings.reviewThanks"))}
            onAlreadyReviewed={() => markReviewed(t("bookings.reviewAlready"))}
            onCancel={() => setReviewOpen(false)}
          />
        )}
      </div>
    </li>
  );
};

export default BookingItem;
