import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { useAuth, OPEN_AUTH_EVENT } from "../../context/AuthContext";
import { useSearch } from "../../context/SearchContext";
import { api, toIsoDay } from "../../api/client";
import DatePickerPanel from "../DatePickerPanel";
import { formatPrice, formatDay, nightsBetween } from "../../utils/format";
import "./BookingWidget.css";

// Événement écouté par AuthProvider pour ouvrir la fenêtre de connexion.
export { OPEN_AUTH_EVENT };

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const isValidDate = (d) => d instanceof Date && !Number.isNaN(d.getTime());

// Une plage réservée [checkIn, checkOut[ chevauche-t-elle les nuits [from, to[ ?
const overlaps = (booked, fromIso, toIso) => booked.some((b) => b.checkIn < toIso && b.checkOut > fromIso);

const BookingWidget = ({ listing, demo = false }) => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { appliedSearch } = useSearch();
  const widgetRef = useRef(null);
  const mountedRef = useRef(true);
  const maxGuests = Math.max(1, Number(listing.maxGuests) || 1);
  const currency = listing.currency || "XOF";
  const price = Number(listing.price) || 0;
  // Réservation sur demande : la réservation créée est PENDING jusqu'à la réponse de l'hôte (48 h).
  const onRequest = listing.instantBook === false;

  // Pré-remplissage depuis la recherche appliquée (dates futures uniquement).
  const [checkIn, setCheckIn] = useState(() => {
    const d = appliedSearch?.checkIn;
    return isValidDate(d) && d >= startOfToday() ? d : null;
  });
  const [checkOut, setCheckOut] = useState(() => {
    const ci = appliedSearch?.checkIn;
    const co = appliedSearch?.checkOut;
    return isValidDate(ci) && ci >= startOfToday() && isValidDate(co) && co > ci ? co : null;
  });
  const [guests, setGuests] = useState(() => {
    const n = (appliedSearch?.adults || 0) + (appliedSearch?.children || 0);
    return Math.min(maxGuests, Math.max(1, n));
  });
  const [booked, setBooked] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadAvailability = useCallback(() => {
    return api
      .getAvailability(listing.id)
      .then((res) => {
        if (mountedRef.current) setBooked(Array.isArray(res?.booked) ? res.booked : []);
      })
      .catch(() => {
        // Disponibilité indicative : le serveur revalide à la réservation (409).
      });
  }, [listing.id]);

  useEffect(() => {
    if (!demo) loadAvailability();
  }, [demo, loadAvailability]);

  const isDateDisabled = useCallback(
    (date, { selecting, checkIn: start }) => {
      const iso = toIsoDay(date);
      if (selecting === "out" && start && date > start) {
        // Départ possible si toutes les nuits [arrivée, départ[ sont libres.
        return overlaps(booked, toIsoDay(start), iso);
      }
      // Arrivée : la nuit du jour doit être libre (le jour de départ d'un séjour reste sélectionnable).
      return booked.some((b) => b.checkIn <= iso && iso < b.checkOut);
    },
    [booked]
  );

  const nights = nightsBetween(checkIn, checkOut);
  const total = nights * price;
  const datesConflict = nights > 0 && overlaps(booked, toIsoDay(checkIn), toIsoDay(checkOut));
  const isOwner = user && listing.hostId != null && String(user.id) === String(listing.hostId);

  const handleCheckOut = (date) => {
    setCheckOut(date);
    setFeedback(null);
    setConfirmation(null);
    if (date) setPickerOpen(false);
  };

  const handleCheckIn = (date) => {
    setCheckIn(date);
    setFeedback(null);
    setConfirmation(null);
  };

  const clearDates = () => {
    setCheckIn(null);
    setCheckOut(null);
    setFeedback(null);
  };

  const openAuth = () => window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setConfirmation(null);
    if (!user) {
      setFeedback({ type: "login" });
      return;
    }
    if (nights <= 0) {
      setFeedback({ type: "error", message: t("booking.selectDates") });
      setPickerOpen(true);
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const booking = await api.createBooking(listing.id, { checkIn, checkOut, guests });
      if (!mountedRef.current) return;
      setConfirmation(booking);
      loadAvailability();
    } catch (err) {
      if (!mountedRef.current) return;
      if (err?.status === 409) {
        setFeedback({ type: "error", message: t("booking.unavailable") });
        loadAvailability();
      } else if (err?.status === 401) {
        setFeedback({ type: "login" });
      } else {
        setFeedback({ type: "error", message: err?.message || t("booking.genericError") });
      }
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const scrollToWidget = () => {
    widgetRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    if (!demo && nights <= 0) setPickerOpen(true);
  };

  const pricePerNight = formatPrice(price, currency, language);

  return (
    <>
      <aside className="booking-widget" ref={widgetRef} aria-labelledby="booking-widget-title">
        <h2 id="booking-widget-title" className="booking-widget-price">
          <strong>{pricePerNight}</strong> <span>/ {t("common.night")}</span>
        </h2>

        {demo ? (
          <p className="booking-widget-note" role="note">
            {t("booking.demoUnavailable")}
          </p>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {onRequest && <p className="booking-widget-request-note">{t("bookingRequest.note")}</p>}
            <div className="booking-widget-fields">
              <button
                type="button"
                className="booking-widget-dates"
                onClick={() => setPickerOpen((o) => !o)}
                aria-expanded={pickerOpen}
              >
                <span className="booking-widget-field">
                  <span className="booking-widget-label">{t("booking.checkIn")}</span>
                  <span>{checkIn ? formatDay(checkIn, language) : t("booking.addDate")}</span>
                </span>
                <span className="booking-widget-field">
                  <span className="booking-widget-label">{t("booking.checkOut")}</span>
                  <span>{checkOut ? formatDay(checkOut, language) : t("booking.addDate")}</span>
                </span>
              </button>
              <div className="booking-widget-guests">
                <span className="booking-widget-label" id="booking-guests-label">
                  {t("booking.guests")}
                </span>
                <div className="booking-widget-stepper" role="group" aria-labelledby="booking-guests-label">
                  <button
                    type="button"
                    onClick={() => setGuests((g) => Math.max(1, g - 1))}
                    disabled={guests <= 1}
                    aria-label={t("booking.fewerGuests")}
                  >
                    −
                  </button>
                  <output aria-live="polite">{guests}</output>
                  <button
                    type="button"
                    onClick={() => setGuests((g) => Math.min(maxGuests, g + 1))}
                    disabled={guests >= maxGuests}
                    aria-label={t("booking.moreGuests")}
                  >
                    +
                  </button>
                </div>
                <span className="booking-widget-hint">
                  {t("booking.maxGuests")} : {maxGuests}
                </span>
              </div>
            </div>

            {pickerOpen && (
              <div className="booking-widget-picker">
                <DatePickerPanel
                  checkIn={checkIn}
                  checkOut={checkOut}
                  flexibility="exact"
                  onCheckInChange={handleCheckIn}
                  onCheckOutChange={handleCheckOut}
                  onFlexibilityChange={() => {}}
                  isDateDisabled={isDateDisabled}
                  datesOnly
                />
                <div className="booking-widget-picker-actions">
                  <button type="button" className="booking-widget-link" onClick={clearDates}>
                    {t("booking.clearDates")}
                  </button>
                  <button type="button" className="booking-widget-link" onClick={() => setPickerOpen(false)}>
                    {t("booking.close")}
                  </button>
                </div>
              </div>
            )}

            {nights > 0 && (
              <dl className="booking-widget-summary">
                <div>
                  <dt>
                    {pricePerNight} × {nights} {nights > 1 ? t("booking.nights") : t("booking.night")}
                  </dt>
                  <dd>{formatPrice(total, currency, language)}</dd>
                </div>
                <div className="booking-widget-total">
                  <dt>{t("booking.total")}</dt>
                  <dd data-testid="booking-total">{formatPrice(total, currency, language)}</dd>
                </div>
              </dl>
            )}

            {datesConflict && (
              <p className="booking-widget-error" role="alert">
                {t("booking.unavailable")}
              </p>
            )}

            {isOwner ? (
              <p className="booking-widget-note">{t("booking.ownListing")}</p>
            ) : (
              <button type="submit" className="booking-widget-submit" disabled={submitting || datesConflict}>
                {submitting
                  ? t(onRequest ? "bookingRequest.submitting" : "booking.submitting")
                  : t(onRequest ? "bookingRequest.submit" : "booking.reserve")}
              </button>
            )}

            {feedback?.type === "login" && (
              <div className="booking-widget-login" role="alert">
                <p>{t("booking.loginRequired")}</p>
                <button type="button" className="booking-widget-login-btn" onClick={openAuth}>
                  {t("booking.loginCta")}
                </button>
              </div>
            )}
            {feedback?.type === "error" && !datesConflict && (
              <p className="booking-widget-error" role="alert">
                {feedback.message}
              </p>
            )}
            {confirmation && (
              <div className="booking-widget-success" role="status">
                <p>
                  <strong>
                    {confirmation.status === "PENDING" ? t("bookingRequest.sentTitle") : t("booking.confirmed")}
                  </strong>
                </p>
                {confirmation.status === "PENDING" && <p>{t("bookingRequest.sentText")}</p>}
                <p>
                  {formatDay(confirmation.checkIn, language)} → {formatDay(confirmation.checkOut, language)} ·{" "}
                  {formatPrice(confirmation.totalPrice, confirmation.currency || currency, language)}
                </p>
                <Link to="/profil" className="booking-widget-success-link">
                  {t("booking.viewMyBookings")}
                </Link>
              </div>
            )}
            <p className="booking-widget-hint">{t("booking.noCharge")}</p>
          </form>
        )}
      </aside>

      <div className="booking-mobile-bar">
        <span className="booking-mobile-bar-price">
          <strong>{nights > 0 ? formatPrice(total, currency, language) : pricePerNight}</strong>
          <span>
            {nights > 0
              ? ` · ${nights} ${nights > 1 ? t("booking.nights") : t("booking.night")}`
              : ` / ${t("common.night")}`}
          </span>
        </span>
        <button type="button" className="booking-mobile-bar-btn" onClick={scrollToWidget}>
          {demo ? t("booking.details") : t(onRequest ? "bookingRequest.submit" : "booking.reserve")}
        </button>
      </div>
    </>
  );
};

export default BookingWidget;
