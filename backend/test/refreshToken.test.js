import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  checkRefreshToken,
  generateRefreshToken,
  hasAppHeader,
  hashRefreshToken,
  parseCookies,
  readRefreshCookie,
  refreshCookieOptions,
} from "../src/utils/refreshToken.js";

const now = new Date("2026-10-22T12:00:00.000Z");
const DAY = 24 * 3600 * 1000;

test("jeton de renouvellement : 32 octets base64url, seul le SHA-256 est stocké, expiration +N jours", () => {
  const a = generateRefreshToken(now, 30);
  const b = generateRefreshToken(now, 30);
  assert.notEqual(a.token, b.token);
  assert.equal(Buffer.from(a.token, "base64url").length, 32);
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(a.tokenHash, crypto.createHash("sha256").update(a.token).digest("hex"));
  assert.equal(hashRefreshToken(a.token), a.tokenHash);
  assert.equal(a.expiresAt.getTime() - now.getTime(), 30 * DAY);
  assert.equal(generateRefreshToken(now, 7).expiresAt.getTime() - now.getTime(), 7 * DAY);
});

test("checkRefreshToken : valide, inconnu, révoqué (réutilisation), expiré, mot de passe changé", () => {
  const record = { revokedAt: null, expiresAt: new Date(now.getTime() + DAY), createdAt: new Date(now.getTime() - DAY) };
  assert.deepEqual(checkRefreshToken(record, { now }), { ok: true });
  assert.deepEqual(checkRefreshToken(null, { now }), { ok: false, reason: "invalid" });
  assert.deepEqual(checkRefreshToken({ ...record, revokedAt: now }, { now }), { ok: false, reason: "reused" });
  assert.deepEqual(checkRefreshToken({ ...record, expiresAt: now }, { now }), { ok: false, reason: "expired" });
  assert.deepEqual(checkRefreshToken(record, { now, passwordChangedAt: now }), { ok: false, reason: "password_changed" });
  // Changement antérieur à la création du jeton : sans effet.
  assert.deepEqual(checkRefreshToken(record, { now, passwordChangedAt: new Date(now.getTime() - 2 * DAY) }), { ok: true });
});

test("options du cookie : httpOnly, SameSite=Strict, Path=/api/auth, Secure selon l'environnement", () => {
  const prod = refreshCookieOptions({ secure: true, ttlDays: 30 });
  assert.deepEqual(prod, { httpOnly: true, secure: true, sameSite: "strict", path: "/api/auth", maxAge: 30 * DAY });
  assert.equal(refreshCookieOptions({ secure: false, ttlDays: 30 }).secure, false);
  // Effacement : mêmes attributs, sans maxAge.
  assert.equal("maxAge" in refreshCookieOptions({ secure: true }), false);
  assert.equal(REFRESH_COOKIE, "afrikabnb_rt");
  assert.equal(REFRESH_COOKIE_PATH, "/api/auth");
});

test("parseCookies : plusieurs cookies, espaces, valeurs encodées ou entre guillemets, entrées invalides", () => {
  assert.deepEqual(parseCookies("a=1; b=deux ;c=%C3%A9"), { a: "1", b: "deux", c: "é" });
  assert.deepEqual(parseCookies('x="abc"; x=ignoré'), { x: "abc" });
  assert.deepEqual(parseCookies("sans-egal; =vide; d=%E0%A4%A"), { d: "%E0%A4%A" });
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies(""), {});
});

test("readRefreshCookie : seulement un jeton de 43 caractères base64url", () => {
  const { token } = generateRefreshToken(now);
  assert.equal(readRefreshCookie({ headers: { cookie: `theme=dark; afrikabnb_rt=${token}` } }), token);
  assert.equal(readRefreshCookie({ headers: { cookie: "afrikabnb_rt=court" } }), null);
  assert.equal(readRefreshCookie({ headers: {} }), null);
});

test("hasAppHeader : X-Requested-With: afrikabnb exigé", () => {
  assert.equal(hasAppHeader({ headers: { "x-requested-with": "afrikabnb" } }), true);
  assert.equal(hasAppHeader({ headers: { "x-requested-with": "XMLHttpRequest" } }), false);
  assert.equal(hasAppHeader({ headers: {} }), false);
});
