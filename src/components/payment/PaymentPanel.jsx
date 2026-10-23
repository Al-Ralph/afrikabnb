import React, { useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { useCurrency } from "../../context/CurrencyContext";
import { usePaymentsConfig } from "../../hooks/usePaymentsConfig";
import { formatPrice } from "../../utils/format";
import { interpolate } from "../../utils/plural";
import PaymentBadge, { formatDueDate, isPayable } from "./PaymentBadge";
import { goToPayment } from "./navigation";
import "./Payment.css";

// Contexte de la page de retour (/paiement/retour) : permet d'y relancer un paiement refusé.
// Onglet courant uniquement (sessionStorage) ; jeton d'un voyageur sans compte inclus.
export const PAYMENT_RETURN_KEY = "afrikabnb_payment_return";

export function savePaymentReturn(value) {
  try {
    sessionStorage.setItem(PAYMENT_RETURN_KEY, JSON.stringify(value));
  } catch {
    // Stockage indisponible : la page de retour proposera de revenir aux réservations.
  }
}

export function readPaymentReturn() {
  try {
    const value = JSON.parse(sessionStorage.getItem(PAYMENT_RETURN_KEY) || "null");
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

// Erreur de l'API de paiement -> clé de traduction.
export function paymentErrorKey(err) {
  if (err?.status === 409) return "payment.errors.notPayable";
  if (err?.status === 429) return "payment.errors.tooMany";
  if (err?.status === 502 || err?.status === 503 || err?.network) return "payment.errors.unavailable";
  return "payment.errors.generic";
}

// Statut de paiement d'une réservation et bouton « Payer avec Mobile Money ».
// start(lang) -> Promise<{ transactionId, paymentUrl }> (API voyageur connecté ou sans compte).
// guestToken : réservation sans compte (mémorisé pour la page de retour).
// Paiements désactivés ou aucun paiement attendu : rien n'est affiché.
const PaymentPanel = ({ booking, start, guestToken }) => {
  const { t, language } = useLanguage();
  const { formatAmount, isConverted } = useCurrency();
  const payments = usePaymentsConfig();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!payments.enabled || !booking) return null;
  const status = booking.paymentStatus;
  if (!["UNPAID", "PAID", "REFUND_DUE", "REFUNDED"].includes(status)) return null;
  if (status === "UNPAID" && booking.status !== "CONFIRMED") return null;

  const payable = isPayable(booking);
  // Montant exact facturé (XOF, arrondi au multiple de 5 supérieur par l'API).
  const amount = Number(booking.paymentAmount ?? booking.totalPrice);
  const rounded = Number.isFinite(Number(booking.totalPrice)) && amount !== Number(booking.totalPrice);

  const pay = async () => {
    setError("");
    setBusy(true);
    try {
      const result = await start(language);
      if (!/^https?:\/\//.test(result?.paymentUrl || "")) throw new Error("paymentUrl");
      savePaymentReturn({ transactionId: result.transactionId, bookingId: booking.id, guestToken: guestToken || null });
      goToPayment(result.paymentUrl);
    } catch (err) {
      setError(t(paymentErrorKey(err)));
      setBusy(false);
    }
  };

  return (
    <section className="payment-panel" aria-label={t("payment.title")} data-testid="payment-panel">
      <div>
        <PaymentBadge booking={booking} />
      </div>
      {payable && (
        <>
          <p className="payment-amount" data-testid="payment-amount">
            {interpolate(t("payment.amountExact"), { amount: formatPrice(amount, "XOF", language) })}
          </p>
          {isConverted("XOF") && (
            <p className="payment-muted">{interpolate(t("payment.approx"), { amount: formatAmount(amount, "XOF") })}</p>
          )}
          {rounded && <p className="payment-muted">{t("payment.rounded")}</p>}
          <p className="payment-muted">
            {interpolate(t("payment.dueText"), { date: formatDueDate(booking.paymentDueAt, language) })}
          </p>
          {error && (
            <p className="payment-error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="btn btn--primary payment-pay" onClick={pay} disabled={busy}>
            {busy ? t("payment.redirecting") : t("payment.pay")}
          </button>
          <p className="payment-muted">{t("payment.secureNote")}</p>
        </>
      )}
      {status === "REFUND_DUE" && <p className="payment-muted">{t("payment.refundInfo")}</p>}
      {status === "REFUNDED" && <p className="payment-muted">{t("payment.refundedInfo")}</p>}
    </section>
  );
};

export default PaymentPanel;
