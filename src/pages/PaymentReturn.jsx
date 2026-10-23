import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { api } from "../api/client";
import { formatPrice } from "../utils/format";
import { interpolate } from "../utils/plural";
import { paymentErrorKey, readPaymentReturn, savePaymentReturn } from "../components/payment/PaymentPanel";
import { goToPayment } from "../components/payment/navigation";
import { isPayable } from "../components/payment/PaymentBadge";
import "./Checkout.css";
import "../components/payment/Payment.css";

const TX_RE = /^AFB[0-9A-F]{32}$/;
// Nouvelle interrogation tant que le paiement est en attente (le serveur re-vérifie auprès du
// prestataire au plus toutes les 10 s).
export const POLL_INTERVAL_MS = 4000;
export const MAX_POLLS = 15;

// Résultat affiché à partir de GET /api/payments/:tx/status (jamais à partir du retour navigateur).
export function paymentOutcome(data) {
  if (!data) return "pending";
  const bookingPayment = data.booking?.paymentStatus;
  if (data.status === "ACCEPTED") {
    return bookingPayment === "REFUND_DUE" || bookingPayment === "REFUNDED" ? "refund" : "success";
  }
  if (data.status === "REFUSED" || data.status === "FAILED") return "failed";
  return "pending";
}

// Page de retour après paiement : /paiement/retour?tx=… (atteinte par navigation complète, après la
// redirection 303 de l'API : l'adresse est lue une fois au montage).
const PaymentReturn = () => {
  const { t, language } = useLanguage();
  const [tx] = useState(() => new URLSearchParams(window.location.search).get("tx") || "");
  const valid = TX_RE.test(tx);
  const [state, setState] = useState(valid ? "loading" : "notFound");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const polls = useRef(0);
  const timer = useRef(null);
  const context = useRef(readPaymentReturn());

  const load = useCallback(() => {
    clearTimeout(timer.current);
    return api
      .getPaymentStatus(tx)
      .then((res) => {
        setData(res);
        setState("ready");
        if (paymentOutcome(res) === "pending" && polls.current < MAX_POLLS) {
          polls.current += 1;
          timer.current = setTimeout(load, POLL_INTERVAL_MS);
        }
      })
      .catch((err) => setState(err?.status === 404 ? "notFound" : "error"));
  }, [tx]);

  useEffect(() => {
    if (valid) load();
    return () => clearTimeout(timer.current);
  }, [valid, load]);

  const refresh = () => {
    polls.current = 0;
    load();
  };

  // Le statut public ne contient ni l'identifiant de la réservation ni le lien de paiement : la
  // relance s'appuie sur le contexte mémorisé avant la redirection (même onglet).
  const guestToken = context.current?.guestToken || null;
  const bookingId = context.current?.bookingId || null;

  const retry = async () => {
    setError("");
    setRetrying(true);
    try {
      const result = guestToken
        ? await api.startGuestPayment(guestToken, language)
        : await api.startBookingPayment(bookingId, language);
      if (!/^https?:\/\//.test(result?.paymentUrl || "")) throw new Error("paymentUrl");
      savePaymentReturn({ transactionId: result.transactionId, bookingId, guestToken });
      goToPayment(result.paymentUrl);
    } catch (err) {
      setError(t(paymentErrorKey(err)));
      setRetrying(false);
    }
  };

  const backLink = guestToken ? (
    <Link to={`/reservation/${encodeURIComponent(guestToken)}`} className="btn btn--secondary">
      {t("payment.return.tracking")}
    </Link>
  ) : (
    <Link to="/profil" className="btn btn--secondary">
      {t("payment.return.myBookings")}
    </Link>
  );

  let body;
  if (state === "notFound") {
    body = (
      <>
        <h1 className="checkout-title">{t("payment.return.notFoundTitle")}</h1>
        <p role="alert">{t("payment.return.notFoundText")}</p>
      </>
    );
  } else if (state === "error") {
    body = (
      <>
        <h1 className="checkout-title">{t("payment.return.title")}</h1>
        <p className="checkout-alert" role="alert">
          {t("payment.return.error")}
        </p>
        <div className="payment-return-actions">
          <button type="button" className="btn btn--primary" onClick={refresh}>
            {t("payment.return.refresh")}
          </button>
        </div>
      </>
    );
  } else if (state === "loading") {
    body = (
      <p className="checkout-loading" role="status" aria-busy="true">
        {t("payment.return.checking")}
      </p>
    );
  } else {
    const outcome = paymentOutcome(data);
    const amount = data?.amount != null ? formatPrice(data.amount, data.currency || "XOF", language) : null;
    const canRetry = outcome === "failed" && isPayable(data?.booking) && (guestToken || bookingId);
    body = (
      <div role="status" data-testid={`payment-${outcome}`}>
        {outcome === "success" && (
          <>
            <h1 className="checkout-title">{t("payment.return.successTitle")}</h1>
            {amount && <p className="payment-amount">{interpolate(t("payment.amountExact"), { amount })}</p>}
            <p>{t("payment.return.successText")}</p>
          </>
        )}
        {outcome === "refund" && (
          <>
            <h1 className="checkout-title">{t("payment.return.refundTitle")}</h1>
            <p>{t("payment.return.refundText")}</p>
          </>
        )}
        {outcome === "pending" && (
          <>
            <h1 className="checkout-title">{t("payment.return.pendingTitle")}</h1>
            <p>{t("payment.return.pendingText")}</p>
          </>
        )}
        {outcome === "failed" && (
          <>
            <h1 className="checkout-title">{t("payment.return.failedTitle")}</h1>
            <p>{t("payment.return.failedText")}</p>
            {!isPayable(data?.booking) && <p className="payment-muted">{t("payment.return.expiredText")}</p>}
          </>
        )}
        {error && (
          <p className="payment-error" role="alert">
            {error}
          </p>
        )}
        <div className="payment-return-actions">
          {canRetry && (
            <button type="button" className="btn btn--primary" onClick={retry} disabled={retrying}>
              {retrying ? t("payment.redirecting") : t("payment.return.retry")}
            </button>
          )}
          {outcome === "pending" && (
            <button type="button" className="btn btn--secondary" onClick={refresh}>
              {t("payment.return.refresh")}
            </button>
          )}
          {backLink}
        </div>
      </div>
    );
  }

  return (
    <main className="checkout-page">
      <section className="checkout-card checkout-done">{body}</section>
    </main>
  );
};

export default PaymentReturn;
