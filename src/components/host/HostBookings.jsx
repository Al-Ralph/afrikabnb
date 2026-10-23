import React, { useEffect, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { useCurrency } from "../../context/CurrencyContext";
import { api, toIsoDay } from "../../api/client";
import { formatDay } from "../../utils/format";
import { interpolate } from "../../utils/plural";
import { countryName } from "../booking/countries";
import ConfirmButton from "./ConfirmButton";
import EmptyState from "../EmptyState";
import PaymentBadge from "../payment/PaymentBadge";
import { usePaymentsConfig } from "../../hooks/usePaymentsConfig";
import "./HostBookings.css";

export const BOOKING_STATUSES = ["PENDING", "CONFIRMED", "DECLINED", "EXPIRED", "CANCELLED"];
const FILTERS = ["ALL", ...BOOKING_STATUSES];

// Statut affiché : une demande dont le délai de réponse est écoulé est présentée comme expirée,
// sans attendre le prochain rechargement (l'API la renverra EXPIRED).
export const effectiveStatus = (booking, now = Date.now()) => {
  if (booking.status !== "PENDING" || !booking.expiresAt) return booking.status;
  const end = Date.parse(booking.expiresAt);
  return Number.isFinite(end) && end <= now ? "EXPIRED" : "PENDING";
};

// Délai restant ("5 h 12 min", "3 min") via Intl.NumberFormat (unités localisées).
export function formatRemaining(ms, language) {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const unit = (value, u) =>
    new Intl.NumberFormat(language, { style: "unit", unit: u, unitDisplay: "short" }).format(value);
  if (hours === 0) return unit(minutes, "minute");
  return minutes ? `${unit(hours, "hour")} ${unit(minutes, "minute")}` : unit(hours, "hour");
}

// Liens de contact : e-mail (validé par l'API) et numéro réduit à ses chiffres et au « + » initial.
const mailtoHref = (email) => `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}`;
const telHref = (phone) => `tel:${String(phone).replace(/(?!^\+)[^\d]/g, "")}`;

// Fiche de contact saisie par le voyageur (visible par l'hôte de l'annonce uniquement).
const ContactCard = ({ booking, t, language }) => {
  const c = booking.contact;
  const titleId = `host-contact-${booking.id}`;
  return (
    <section className="host-contact" aria-labelledby={titleId}>
      <p id={titleId} className="host-contact-title">
        {t("host.contact.title")}
        {booking.guestAccount === false && <span className="host-contact-badge">{t("host.contact.noAccount")}</span>}
      </p>
      {c ? (
        <>
          <dl className="host-contact-list">
            <div>
              <dt>{t("host.contact.name")}</dt>
              <dd>{c.name}</dd>
            </div>
            {c.email && (
              <div>
                <dt>{t("host.contact.email")}</dt>
                <dd>
                  <a href={mailtoHref(c.email)}>{c.email}</a>
                </dd>
              </div>
            )}
            {c.phone && (
              <div>
                <dt>{t("host.contact.phone")}</dt>
                <dd>
                  <a href={telHref(c.phone)}>{c.phone}</a>
                </dd>
              </div>
            )}
            {c.country && (
              <div>
                <dt>{t("host.contact.country")}</dt>
                <dd>{countryName(c.country, language)}</dd>
              </div>
            )}
            {c.arrivalTime && (
              <div>
                <dt>{t("host.contact.arrivalTime")}</dt>
                <dd>{c.arrivalTime}</dd>
              </div>
            )}
          </dl>
          {c.message && (
            <div className="host-contact-message">
              <p className="host-contact-label">{t("host.contact.message")}</p>
              <blockquote>{c.message}</blockquote>
            </div>
          )}
          <p className="host-contact-note">{t("host.contact.enteredByGuest")}</p>
        </>
      ) : (
        <p className="host-muted">{t("host.contact.none")}</p>
      )}
    </section>
  );
};

// Heure courante rafraîchie chaque minute (compte à rebours des demandes).
function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Réservations reçues par l'hôte : filtres par statut, réponse aux demandes (48 h),
// annulation des séjours confirmés à venir.
const HostBookings = ({ bookings, onBookingUpdated, onReload }) => {
  const { t, language } = useLanguage();
  const { formatAmount } = useCurrency();
  const payments = usePaymentsConfig();
  const [filter, setFilter] = useState("ALL");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const now = useNow();
  const todayIso = toIsoDay(new Date(now));

  const withStatus = bookings.map((b) => ({ ...b, displayStatus: effectiveStatus(b, now) }));
  const counts = withStatus.reduce((acc, b) => ({ ...acc, [b.displayStatus]: (acc[b.displayStatus] || 0) + 1 }), {});
  const visible = filter === "ALL" ? withStatus : withStatus.filter((b) => b.displayStatus === filter);

  // La réponse peut être en vue voyageur : on conserve voyageur, annonce et fiche de contact de la vue hôte.
  const merge = (booking, updated) => ({
    ...booking,
    ...updated,
    guest: updated?.guest || booking.guest,
    listing: booking.listing,
    contact: updated?.contact || booking.contact,
  });

  const act = async (booking, action, successKey) => {
    setError(null);
    setNotice(null);
    try {
      const updated = await api[action](booking.id);
      onBookingUpdated(merge(booking, updated));
      if (successKey) setNotice(t(successKey));
    } catch (err) {
      if (err?.status === 409) {
        // Expirée, déjà traitée ou dates prises entre-temps : on recharge l'état réel.
        setError(t("host.bookings.conflict"));
        onReload?.();
      } else {
        setError(err?.message || t("host.errors.generic"));
      }
    }
  };

  if (bookings.length === 0) {
    return (
      <EmptyState compact icon="calendar" title={t("host.bookings.emptyTitle")}>
        <p>{t("host.noBookings")}</p>
      </EmptyState>
    );
  }

  const filterLabel = (f) => t(`host.bookings.filters.${f}`);

  return (
    <div className="host-bookings-wrap">
      <div className="host-filters" role="group" aria-label={t("host.bookings.filterLabel")}>
        {FILTERS.map((f) => {
          const count = f === "ALL" ? bookings.length : counts[f] || 0;
          return (
            <button
              key={f}
              type="button"
              className={`host-chip${filter === f ? " host-chip--active" : ""}`}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {filterLabel(f)} <span className="host-chip-count tabular">{count}</span>
            </button>
          );
        })}
      </div>

      {notice && (
        <p className="host-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="host-alert" role="alert">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="host-muted">{t("host.bookings.noneForFilter")}</p>
      ) : (
        <ul className="host-bookings">
          {visible.map((b) => {
            const guestName = b.guest?.name || b.contact?.name || t("host.guestUnknown");
            const status = b.displayStatus;
            const canCancel = status === "CONFIRMED" && b.checkIn > todayIso;
            const remaining = status === "PENDING" && b.expiresAt ? Date.parse(b.expiresAt) - now : null;
            return (
              <li key={b.id} className={`host-booking${status === "PENDING" ? " host-booking--pending" : ""}`}>
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
                  {remaining != null && (
                    <p className="host-booking-deadline">
                      {interpolate(t("host.bookings.expiresIn"), { time: formatRemaining(remaining, language) })}
                    </p>
                  )}
                </div>
                <div className="host-booking-side">
                  <span className={`host-status host-status--${String(status).toLowerCase()}`}>
                    {t(`host.status.${status}`)}
                  </span>
                  <strong>{formatAmount(b.totalPrice, b.currency || b.listing?.currency)}</strong>
                  {payments.enabled && status !== "PENDING" && (
                    <PaymentBadge booking={{ ...b, status }} label={t("payment.hostUnpaid")} />
                  )}
                  {status === "PENDING" && (
                    <div className="host-booking-actions">
                      <ConfirmButton
                        className="host-btn host-btn--primary"
                        tone="primary"
                        label={t("host.bookings.accept")}
                        prompt={t("host.bookings.confirmAccept")}
                        confirmLabel={t("host.confirmYes")}
                        cancelLabel={t("host.confirmNo")}
                        onConfirm={() => act(b, "confirmBooking", "host.bookings.accepted")}
                      />
                      <ConfirmButton
                        className="host-btn host-btn--danger-outline"
                        label={t("host.bookings.decline")}
                        prompt={t("host.bookings.confirmDecline")}
                        confirmLabel={t("host.confirmYes")}
                        cancelLabel={t("host.confirmNo")}
                        onConfirm={() => act(b, "declineBooking", "host.bookings.declined")}
                      />
                    </div>
                  )}
                  {canCancel && (
                    <ConfirmButton
                      className="host-btn host-btn--danger-outline"
                      label={t("host.cancelBooking")}
                      prompt={t("host.confirmCancelBooking")}
                      confirmLabel={t("host.confirmYes")}
                      cancelLabel={t("host.confirmNo")}
                      onConfirm={() => act(b, "cancelBooking")}
                    />
                  )}
                </div>
                <ContactCard booking={b} t={t} language={language} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default HostBookings;
