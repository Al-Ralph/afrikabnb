// Jeton d'accès d'une réservation sans compte (logique pure), sur le modèle de resetToken.js :
// 32 octets aléatoires (base64url, 43 caractères) envoyés au voyageur (lien de suivi), seule
// l'empreinte SHA-256 est stockée (Booking.guestAccessTokenHash).
import crypto from "node:crypto";
import { hashResetToken } from "./resetToken.js";
import { parseDay } from "./booking.js";

export const GUEST_ACCESS_TOKEN_BYTES = 32;
// Le lien reste valable 30 jours après la date de départ.
export const GUEST_ACCESS_DAYS_AFTER_CHECKOUT = 30;
export const GUEST_ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const hashGuestAccessToken = hashResetToken;

export function isGuestAccessTokenFormat(token) {
  return typeof token === "string" && GUEST_ACCESS_TOKEN_PATTERN.test(token);
}

// checkOut : "YYYY-MM-DD" ou Date (jour UTC).
export function guestAccessExpiry(checkOut) {
  const end = checkOut instanceof Date ? checkOut : parseDay(checkOut);
  return new Date(end.getTime() + GUEST_ACCESS_DAYS_AFTER_CHECKOUT * 24 * 60 * 60 * 1000);
}

export function generateGuestAccessToken(checkOut) {
  const token = crypto.randomBytes(GUEST_ACCESS_TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashGuestAccessToken(token), expiresAt: guestAccessExpiry(checkOut) };
}

// Vrai si l'enregistrement donne encore accès (expiration non atteinte).
export function isGuestAccessValid(record, now = new Date()) {
  if (!record?.guestAccessTokenHash || !record.guestAccessExpiresAt) return false;
  return new Date(record.guestAccessExpiresAt).getTime() > now.getTime();
}
