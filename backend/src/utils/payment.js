// Logique pure (sans base ni réseau) du paiement CinetPay.
// Référence : documentation CinetPay API Checkout v2 (docs.cinetpay.com/api/1.0-fr/checkout/…) :
// initialisation, notification, vérification, X-TOKEN HMAC.
import crypto from "node:crypto";

// Devise facturée : les prix des annonces sont en francs CFA (XOF).
export const PAYMENT_CURRENCY = "XOF";
// CinetPay : « Le montant doit être un multiple de 5 » (sauf USD).
export const AMOUNT_STEP = 5;
// Préfixe + 32 caractères hexadécimaux (128 bits aléatoires) : non devinable, sans les caractères
// déconseillés par CinetPay dans transaction_id (# / $ _ &).
export const TRANSACTION_ID_PATTERN = /^AFB[0-9A-F]{32}$/;
// Paiement accepté peu après l'échéance (confirmation push de l'opérateur en cours) : la réservation
// est conservée si ses dates sont restées libres.
export const PAYMENT_GRACE_MS = 15 * 60 * 1000;
// Réutilisation d'un paiement en cours (même lien de paiement) au lieu d'en créer un nouveau.
export const PAYMENT_REUSE_MS = 20 * 60 * 1000;
// Plafond de tentatives de paiement par réservation (anti-abus).
export const MAX_PAYMENTS_PER_BOOKING = 10;

// Montant à facturer : totalPrice arrondi à l'unité supérieure, puis au multiple de 5 supérieur.
// Calcul en centimes entiers (pas d'erreur d'arrondi flottant).
export function payableAmount(totalPrice) {
  const cents = Math.round(Number(totalPrice) * 100);
  if (!Number.isFinite(cents) || cents <= 0) return 0;
  const units = Math.ceil(cents / 100);
  return Math.ceil(units / AMOUNT_STEP) * AMOUNT_STEP;
}

export function generateTransactionId() {
  return `AFB${crypto.randomBytes(16).toString("hex").toUpperCase()}`;
}

export function isTransactionIdFormat(value) {
  return typeof value === "string" && TRANSACTION_ID_PATTERN.test(value);
}

// Champs du corps de la notification concaténés (dans cet ordre, sans séparateur) pour le
// X-TOKEN : page « CinetPay X-TOKEN HMAC », étape 1.
export const CINETPAY_TOKEN_FIELDS = [
  "cpm_site_id",
  "cpm_trans_id",
  "cpm_trans_date",
  "cpm_amount",
  "cpm_currency",
  "signature",
  "payment_method",
  "cel_phone_num",
  "cpm_phone_prefixe",
  "cpm_language",
  "cpm_version",
  "cpm_payment_config",
  "cpm_page_action",
  "cpm_custom",
  "cpm_designation",
  "cpm_error_message",
];

// hash_hmac('SHA256', $data, $secretKey) de PHP : HMAC-SHA256, sortie hexadécimale minuscule.
// Champ absent : chaîne vide (concaténation PHP d'une variable nulle).
export function computeCinetPayToken(body, secretKey) {
  const data = CINETPAY_TOKEN_FIELDS.map((f) => {
    const v = body?.[f];
    return v == null ? "" : String(v);
  }).join("");
  return crypto.createHmac("sha256", secretKey).update(data, "utf8").digest("hex");
}

// Comparaison exacte à temps constant (hash_equals de PHP).
export function verifyCinetPayToken(body, receivedToken, secretKey) {
  if (!secretKey || typeof receivedToken !== "string" || !receivedToken) return false;
  const expected = Buffer.from(computeCinetPayToken(body, secretKey), "utf8");
  const received = Buffer.from(receivedToken, "utf8");
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

// Statut CinetPay (data.status de /v2/payment/check) -> ACCEPTED | REFUSED | PENDING.
// Documentés : ACCEPTED, REFUSED, WAITING_FOR_CUSTOMER (en attente de validation par le client).
// CANCELED / CANCELLED : traités comme un échec. Toute autre valeur : en attente (jamais un succès).
export function normalizeProviderStatus(raw) {
  const s = String(raw || "").trim().toUpperCase();
  if (s === "ACCEPTED") return "ACCEPTED";
  if (["REFUSED", "CANCELED", "CANCELLED", "FAILED"].includes(s)) return "REFUSED";
  return "PENDING";
}

// Échéance de paiement d'une réservation confirmée : instantanée (minutes) ou demande acceptée (heures).
export function paymentDueDate(kind, { dueMinutesInstant, dueHoursRequest }, now = new Date()) {
  const ms = kind === "instant" ? dueMinutesInstant * 60 * 1000 : dueHoursRequest * 60 * 60 * 1000;
  return new Date(now.getTime() + ms);
}

// Vrai si la réservation confirmée n'est pas payée à son échéance (elle libère alors ses dates).
export function isPaymentOverdue(booking, now = new Date()) {
  return (
    booking?.status === "CONFIRMED" &&
    booking.paymentStatus === "UNPAID" &&
    booking.paymentDueAt != null &&
    new Date(booking.paymentDueAt).getTime() <= now.getTime()
  );
}
