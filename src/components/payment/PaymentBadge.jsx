import React from "react";
import { useLanguage } from "../../context/LanguageContext";
import { interpolate } from "../../utils/plural";
import "./Payment.css";

const SHOWN = ["UNPAID", "PAID", "REFUND_DUE", "REFUNDED"];

// Échéance (ISO) -> « 24 oct. 2026, 14:30 » ; "" si invalide.
export function formatDueDate(iso, language) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

// Vrai si la réservation attend un paiement encore possible (confirmée, non payée, avant l'échéance).
export function isPayable(booking, now = Date.now()) {
  if (!booking || booking.status !== "CONFIRMED" || booking.paymentStatus !== "UNPAID") return false;
  const due = Date.parse(booking.paymentDueAt);
  return Number.isFinite(due) && due > now;
}

// Badge de paiement : « À payer avant… », « Payée », « Remboursement en cours », « Remboursée ».
// Rien pour une réservation sans paiement attendu (NONE) ni pour une impayée annulée.
const PaymentBadge = ({ booking, label }) => {
  const { t, language } = useLanguage();
  const status = booking?.paymentStatus;
  if (!SHOWN.includes(status)) return null;
  let key = status;
  if (status === "UNPAID") {
    if (booking.status !== "CONFIRMED") return null;
    if (!isPayable(booking)) key = "UNPAID_EXPIRED";
  }
  const text =
    key === "UNPAID"
      ? interpolate(label || t("payment.badge.UNPAID"), { date: formatDueDate(booking.paymentDueAt, language) })
      : t(`payment.badge.${key}`);
  return (
    <span className={`payment-badge payment-badge--${key.toLowerCase()}`} data-testid="payment-badge">
      {text}
    </span>
  );
};

export default PaymentBadge;
