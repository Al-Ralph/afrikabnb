// Jetons de réinitialisation du mot de passe (logique pure).
// Le jeton (32 octets aléatoires, base64url) n'est envoyé que par email ; la base ne stocke que
// son empreinte SHA-256 : une fuite de la table ne permet pas de réinitialiser un compte.
import crypto from "node:crypto";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
export const RESET_TOKEN_BYTES = 32;

export function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

export function generateResetToken(now = new Date()) {
  const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString("base64url");
  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
  };
}

// Comparaison à temps constant de deux empreintes hexadécimales.
export function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length === 0 || ba.length !== bb.length || a.length !== ba.length * 2 || b.length !== bb.length * 2) {
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

// Vérifie un enregistrement PasswordResetToken pour le jeton fourni.
// Retourne { ok: true } ou { ok: false, reason: "invalid" | "used" | "expired" }.
export function checkResetToken(record, token, now = new Date()) {
  if (!record || !safeEqualHex(record.tokenHash, hashResetToken(token))) return { ok: false, reason: "invalid" };
  if (record.usedAt) return { ok: false, reason: "used" };
  if (new Date(record.expiresAt).getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true };
}

// Un JWT émis (iat, en secondes) avant le dernier changement de mot de passe est refusé.
// Comparaison à la seconde : un jeton émis dans la même seconde que le changement reste valide
// (sinon la connexion qui suit immédiatement une réinitialisation serait refusée).
export function isTokenRevokedByPasswordChange(iat, passwordChangedAt) {
  if (!passwordChangedAt) return false;
  if (typeof iat !== "number") return true;
  return iat < Math.floor(new Date(passwordChangedAt).getTime() / 1000);
}
