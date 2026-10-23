import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useCurrency } from "../context/CurrencyContext";
import { api, toIsoDay } from "../api/client";
import { formatDay } from "../utils/format";
import { interpolate } from "../utils/plural";
import EmptyState from "../components/EmptyState";
import PaymentPanel from "../components/payment/PaymentPanel";
import "./Checkout.css";

const CANCELLABLE = ["PENDING", "CONFIRMED"];

// Suivi d'une réservation sans compte : /reservation/:token (lien reçu par e-mail).
// Le jeton est gardé en mémoire puis retiré de la barre d'adresse (historique, captures, Referer).
const GuestBooking = () => {
  const { token: tokenParam } = useParams();
  const { t, language } = useLanguage();
  const { formatAmount } = useCurrency();
  const tokenRef = useRef(tokenParam || "");
  const token = tokenRef.current;
  const [status, setStatus] = useState(token ? "loading" : "missing");
  const [booking, setBooking] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    window.history.replaceState(null, "", "/reservation");
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const load = useCallback(() => {
    if (!token) return Promise.resolve();
    return api
      .getGuestBooking(token)
      .then((data) => {
        setBooking(data);
        setStatus("ready");
      })
      .catch((err) => setStatus(err?.status === 404 ? "invalid" : "error"));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const cancel = async () => {
    setError("");
    setCancelling(true);
    try {
      const updated = await api.cancelGuestBooking(token);
      setBooking((b) => ({ ...b, ...updated, listing: updated.listing || b.listing }));
      setConfirming(false);
      setNotice(t("guestBooking.cancelled"));
    } catch (err) {
      setConfirming(false);
      if (err?.status === 409) {
        setError(t("guestBooking.cancelConflict"));
        load();
      } else if (err?.status === 404) {
        setStatus("invalid");
      } else {
        setError(t("guestBooking.error"));
      }
    } finally {
      setCancelling(false);
    }
  };

  if (status === "missing" || status === "invalid") {
    return (
      <main className="checkout-page">
        <EmptyState icon="key" tone="danger" role="alert" title={t("guestBooking.invalidTitle")}
          action={<Link to="/" className="btn btn--secondary">{t("guestBooking.backHome")}</Link>}>
          <p>{status === "missing" ? t("guestBooking.missingText") : t("guestBooking.invalidText")}</p>
        </EmptyState>
      </main>
    );
  }
  if (status === "error") {
    return (
      <main className="checkout-page">
        <p className="checkout-alert" role="alert">{t("guestBooking.error")}</p>
      </main>
    );
  }
  if (status === "loading" || !booking) {
    return (
      <main className="checkout-page">
        <p className="checkout-loading" role="status" aria-busy="true">{t("guestBooking.loading")}</p>
      </main>
    );
  }

  const listing = booking.listing;
  const currency = booking.currency || listing?.currency || "XOF";
  const canCancel = CANCELLABLE.includes(booking.status) && booking.checkIn > toIsoDay(new Date());
  const guestsLabel = `${booking.guests} ${booking.guests > 1 ? t("booking.guestsPlural") : t("booking.guestSingular")}`;

  return (
    <main className="checkout-page">
      <h1 className="checkout-title">{t("guestBooking.title")}</h1>
      <p className="checkout-note">{t("guestBooking.noAccount")}</p>
      <section className="checkout-card checkout-done" aria-labelledby="guest-booking-listing">
        <span className={`checkout-status checkout-status--${String(booking.status).toLowerCase()}`}>
          {t(`guestBooking.status.${booking.status}`)}
        </span>
        {booking.status === "PENDING" && booking.expiresAt && (
          <p className="checkout-muted">
            {interpolate(t("guestBooking.pendingText"), {
              date: new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(
                new Date(booking.expiresAt)
              ),
            })}
          </p>
        )}
        <div className="checkout-listing">
          {listing?.image && <img src={listing.image} alt="" className="checkout-listing-img" />}
          <div>
            <p id="guest-booking-listing" className="checkout-listing-title">{listing?.title}</p>
            {listing?.location && <p className="checkout-muted">{listing.location}</p>}
          </div>
        </div>
        <dl className="checkout-lines">
          <div>
            <dt>{t("guestBooking.dates")}</dt>
            <dd>
              {formatDay(booking.checkIn, language)} → {formatDay(booking.checkOut, language)}
            </dd>
          </div>
          <div>
            <dt>{t("guestBooking.guests")}</dt>
            <dd>{guestsLabel}</dd>
          </div>
          <div className="checkout-total">
            <dt>{t("guestBooking.total")}</dt>
            <dd>{formatAmount(booking.totalPrice, currency)}</dd>
          </div>
        </dl>

        <PaymentPanel booking={booking} guestToken={token} start={(lang) => api.startGuestPayment(token, lang)} />

        {notice && (
          <p className="checkout-notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="checkout-alert" role="alert">
            {error}
          </p>
        )}

        <div className="checkout-actions">
          {listing?.id && (
            <Link to={`/property/${encodeURIComponent(listing.id)}`} className="btn btn--secondary">
              {t("guestBooking.viewListing")}
            </Link>
          )}
          {canCancel && !confirming && (
            <button type="button" className="btn btn--secondary" onClick={() => setConfirming(true)}>
              {t("guestBooking.cancel")}
            </button>
          )}
        </div>
        {canCancel && confirming && (
          <div className="checkout-account" role="group" aria-label={t("guestBooking.confirmCancel")}>
            <p>{t("guestBooking.confirmCancel")}</p>
            <button type="button" className="btn btn--primary" onClick={cancel} disabled={cancelling}>
              {cancelling ? t("guestBooking.cancelling") : t("guestBooking.confirmYes")}
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setConfirming(false)} disabled={cancelling}>
              {t("guestBooking.confirmNo")}
            </button>
          </div>
        )}
      </section>
    </main>
  );
};

export default GuestBooking;
