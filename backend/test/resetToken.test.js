import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  RESET_TOKEN_TTL_MS,
  checkResetToken,
  generateResetToken,
  hashResetToken,
  isTokenRevokedByPasswordChange,
  safeEqualHex,
} from "../src/utils/resetToken.js";

const now = new Date("2026-10-22T12:00:00.000Z");

test("jeton : 32 octets aléatoires, seul le hash SHA-256 est stocké, expiration +1 h", () => {
  const a = generateResetToken(now);
  const b = generateResetToken(now);
  assert.notEqual(a.token, b.token);
  assert.equal(Buffer.from(a.token, "base64url").length, 32);
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(a.tokenHash, crypto.createHash("sha256").update(a.token).digest("hex"));
  assert.notEqual(a.tokenHash, a.token);
  assert.equal(a.expiresAt.getTime() - now.getTime(), RESET_TOKEN_TTL_MS);
  assert.equal(RESET_TOKEN_TTL_MS, 3600 * 1000);
});

test("checkResetToken : valide, inconnu, utilisé, expiré", () => {
  const { token, tokenHash, expiresAt } = generateResetToken(now);
  const record = { tokenHash, expiresAt, usedAt: null };
  assert.deepEqual(checkResetToken(record, token, now), { ok: true });
  assert.deepEqual(checkResetToken(null, token, now), { ok: false, reason: "invalid" });
  assert.deepEqual(checkResetToken(record, "autre-jeton", now), { ok: false, reason: "invalid" });
  assert.deepEqual(checkResetToken({ ...record, usedAt: now }, token, now), { ok: false, reason: "used" });
  const later = new Date(now.getTime() + RESET_TOKEN_TTL_MS);
  assert.deepEqual(checkResetToken(record, token, later), { ok: false, reason: "expired" });
});

test("safeEqualHex : comparaison à temps constant (timingSafeEqual), longueurs différentes refusées", () => {
  const h = hashResetToken("x");
  const calls = [];
  const original = crypto.timingSafeEqual;
  crypto.timingSafeEqual = (...args) => {
    calls.push(args);
    return original(...args);
  };
  try {
    assert.equal(safeEqualHex(h, hashResetToken("x")), true);
    assert.equal(safeEqualHex(h, hashResetToken("y")), false);
  } finally {
    crypto.timingSafeEqual = original;
  }
  assert.equal(calls.length, 2);
  assert.equal(safeEqualHex(h, h.slice(0, 10)), false);
  assert.equal(safeEqualHex(h, "zz"), false);
  assert.equal(safeEqualHex(undefined, h), false);
});

test("JWT émis avant passwordChangedAt : révoqué (à la seconde près)", () => {
  const changedAt = new Date("2026-10-22T12:00:00.700Z");
  const sec = Math.floor(changedAt.getTime() / 1000);
  assert.equal(isTokenRevokedByPasswordChange(sec - 1, changedAt), true);
  assert.equal(isTokenRevokedByPasswordChange(sec, changedAt), false);
  assert.equal(isTokenRevokedByPasswordChange(sec + 5, changedAt), false);
  assert.equal(isTokenRevokedByPasswordChange(sec - 1000, null), false);
  assert.equal(isTokenRevokedByPasswordChange(undefined, changedAt), true);
});
