// Jetons de renouvellement de session (logique pure, sans base).
// Le jeton (32 octets aléatoires, base64url) ne circule que dans le cookie httpOnly afrikabnb_rt ;
// la base ne stocke que son empreinte SHA-256.
import crypto from "node:crypto";
import { hashResetToken } from "./resetToken.js";

export const REFRESH_COOKIE = "afrikabnb_rt";
// Le cookie n'est envoyé qu'aux routes /api/auth/* (refresh, logout) : jamais aux autres appels.
export const REFRESH_COOKIE_PATH = "/api/auth";
export const REFRESH_TOKEN_BYTES = 32;
// Défense CSRF supplémentaire (en plus de SameSite=Strict) sur /refresh et /logout.
export const APP_HEADER = "x-requested-with";
export const APP_HEADER_VALUE = "afrikabnb";

const DAY_MS = 24 * 60 * 60 * 1000;

export const hashRefreshToken = hashResetToken;

export function generateRefreshToken(now = new Date(), ttlDays = 30) {
  const token = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
  return {
    token,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(now.getTime() + ttlDays * DAY_MS),
  };
}

// Options du cookie (format res.cookie d'Express ; maxAge en millisecondes). Sans ttlDays :
// options d'effacement (res.clearCookie exige les mêmes path / sameSite / secure).
export function refreshCookieOptions({ secure, ttlDays } = {}) {
  const options = { httpOnly: true, secure: Boolean(secure), sameSite: "strict", path: REFRESH_COOKIE_PATH };
  if (ttlDays != null) options.maxAge = ttlDays * DAY_MS;
  return options;
}

// En-tête Cookie -> { nom: valeur } (première occurrence conservée, valeurs décodées si possible).
export function parseCookies(header) {
  const out = {};
  if (typeof header !== "string" || !header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name || Object.prototype.hasOwnProperty.call(out, name)) continue;
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
    try {
      value = decodeURIComponent(value);
    } catch {
      // Valeur non encodée : gardée telle quelle.
    }
    out[name] = value;
  }
  return out;
}

// Jeton présent dans le cookie, s'il a la forme attendue (43 caractères base64url).
export function readRefreshCookie(req) {
  const value = parseCookies(req.headers?.cookie)[REFRESH_COOKIE];
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

// Vérifie un enregistrement RefreshToken. Un jeton déjà révoqué présenté à nouveau signale un vol
// probable (rotation : un jeton légitime ne sert qu'une fois) -> "reused".
// Retourne { ok: true } ou { ok: false, reason: "invalid" | "reused" | "expired" | "password_changed" }.
export function checkRefreshToken(record, { now = new Date(), passwordChangedAt = null } = {}) {
  if (!record) return { ok: false, reason: "invalid" };
  if (record.revokedAt) return { ok: false, reason: "reused" };
  if (new Date(record.expiresAt).getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (passwordChangedAt && new Date(passwordChangedAt).getTime() > new Date(record.createdAt).getTime()) {
    return { ok: false, reason: "password_changed" };
  }
  return { ok: true };
}

export function hasAppHeader(req) {
  return req.headers?.[APP_HEADER] === APP_HEADER_VALUE;
}
