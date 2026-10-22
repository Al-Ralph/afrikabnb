import React, { useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { api, toIsoDay } from "../../api/client";
import { formatPrice, formatDay } from "../../utils/format";
import ConfirmButton from "./ConfirmButton";

// Réservations reçues par l'hôte, avec annulation des séjours à venir.
const HostBookings = ({ bookings, onBookingUpdated }) => {
  const { t, language } = useLanguage();
  const [error, setError] = useState(null);
  const todayIso = toIsoDay(new Date());

  const cancel = async (booking) => {
    setError(null);
    try {
      const updated = await api.cancelBooking(booking.id);
      // La réponse peut être en vue voyageur : on conserve voyageur et annonce de la vue hôte.
      onBookingUpdated({ ...booking, ...updated, guest: booking.guest, listing: booking.listing });
    } catch (err) {
      setError(err?.message || t("host.errors.generic"));
    }
  };

  if (bookings.length === 0) {
    return <p className="host-muted">{t("host.noBookings")}</p>;
  }

  return (
    <>
      {error && (
        <p className="host-alert" role="alert">
          {error}
        </p>
      )}
      <ul className="host-bookings">
        {bookings.map((b) => {
          const guestName = b.guest?.name || t("host.guestUnknown");
          const upcoming = b.status !== "CANCELLED" && b.checkIn > todayIso;
          return (
            <li key={b.id} className="host-booking">
              <div className="host-booking-guest">
                {b.guest?.avatar ? (
                  <img src={b.guest.avatar} alt="" className="host-avatar" />
                ) : (
                  <span className="host-avatar host-avatar--initial" aria-hidden="true">
                    {guestName.charAt(0).toUpperCase()}
                  </span>
                )}
                <div>
                  <p className="host-booking-name">{guestName}</p>
                  <p className="host-muted">{b.listing?.title}</p>
                </div>
              </div>
              <div className="host-booking-info">
                <p>
                  {formatDay(b.checkIn, language)} → {formatDay(b.checkOut, language)}
                </p>
                <p className="host-muted">
                  {b.nights} {b.nights > 1 ? t("booking.nights") : t("booking.night")} · {b.guests}{" "}
                  {b.guests > 1 ? t("booking.guestsPlural") : t("booking.guestSingular")}
                </p>
              </div>
              <div className="host-booking-side">
                <span className={`host-status host-status--${String(b.status).toLowerCase()}`}>
                  {t(`host.status.${b.status}`)}
                </span>
                <strong>{formatPrice(b.totalPrice, b.currency || b.listing?.currency, language)}</strong>
                {upcoming && (
                  <ConfirmButton
                    className="host-btn host-btn--danger-outline"
                    label={t("host.cancelBooking")}
                    prompt={t("host.confirmCancelBooking")}
                    confirmLabel={t("host.confirmYes")}
                    cancelLabel={t("host.confirmNo")}
                    onConfirm={() => cancel(b)}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
};

export default HostBookings;
