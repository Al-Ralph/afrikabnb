// Sessions : jeton d'accès JWT court (corps JSON) + jeton de renouvellement opaque (cookie httpOnly).
// Chaque fonction reçoit le client Prisma (ou un double de test) en paramètre `db`.
import crypto from "node:crypto";
import prisma from "../../config/db.js";
import { config } from "../../config/env.js";
import { signToken } from "../../config/jwt.js";
import {
  REFRESH_COOKIE,
  checkRefreshToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshCookieOptions,
} from "../../utils/refreshToken.js";

export const publicUserSelect = { id: true, email: true, name: true, avatar: true, role: true };

export const requestUserAgent = (req) => {
  const ua = req.headers?.["user-agent"];
  return typeof ua === "string" && ua ? ua.slice(0, 255) : null;
};

export function setRefreshCookie(res, token) {
  res.cookie(
    REFRESH_COOKIE,
    token,
    refreshCookieOptions({ secure: config.session.cookieSecure, ttlDays: config.session.refreshTtlDays })
  );
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions({ secure: config.session.cookieSecure }));
}

// Nouvelle session (connexion, inscription, changement de mot de passe) : nouvelle famille de
// jetons, cookie posé, jeton d'accès renvoyé. Nettoyage paresseux des jetons expirés de l'utilisateur.
export async function startSession(req, res, userId, { db = prisma, now = new Date() } = {}) {
  const { token, tokenHash, expiresAt } = generateRefreshToken(now, config.session.refreshTtlDays);
  await db.refreshToken.deleteMany({ where: { userId, expiresAt: { lt: now } } });
  await db.refreshToken.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      tokenHash,
      familyId: crypto.randomUUID(),
      expiresAt,
      // Horloge de l'API (comparée à passwordChangedAt, lui aussi écrit par l'API).
      createdAt: now,
      userAgent: requestUserAgent(req),
    },
  });
  setRefreshCookie(res, token);
  return signToken(userId);
}

export async function revokeFamily(db, familyId, now = new Date()) {
  await db.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: now } });
}

export async function revokeAllForUser(db, userId, now = new Date()) {
  await db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
}

// Rotation : le jeton présenté est révoqué (replacedById -> successeur) et un nouveau jeton de la
// même famille est émis. Jeton déjà révoqué (réutilisation) : toute la famille est révoquée.
// Retourne { ok: true, user, token, expiresAt } ou { ok: false, reason, userId? }.
export async function rotateRefreshToken(db, rawToken, { now = new Date(), ttlDays, userAgent: ua = null } = {}) {
  const record = await db.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(rawToken) },
    include: { user: { select: { ...publicUserSelect, passwordChangedAt: true } } },
  });
  const check = checkRefreshToken(record, { now, passwordChangedAt: record?.user?.passwordChangedAt });
  if (!check.ok) {
    if (check.reason === "reused") await revokeFamily(db, record.familyId, now);
    else if (check.reason === "password_changed") await revokeAllForUser(db, record.userId, now);
    return { ok: false, reason: check.reason, userId: record?.userId };
  }

  const next = generateRefreshToken(now, ttlDays ?? config.session.refreshTtlDays);
  const nextId = crypto.randomUUID();
  // Révocation conditionnelle et atomique : deux rotations concurrentes du même jeton -> une seule
  // réussit, l'autre est traitée comme une réutilisation.
  const { count } = await db.refreshToken.updateMany({
    where: { id: record.id, revokedAt: null },
    data: { revokedAt: now, replacedById: nextId },
  });
  if (count !== 1) {
    await revokeFamily(db, record.familyId, now);
    return { ok: false, reason: "reused", userId: record.userId };
  }
  await db.refreshToken.create({
    data: {
      id: nextId,
      userId: record.userId,
      tokenHash: next.tokenHash,
      familyId: record.familyId,
      expiresAt: next.expiresAt,
      createdAt: now,
      userAgent: ua,
    },
  });
  const { passwordChangedAt: _, ...user } = record.user;
  return { ok: true, user, token: next.token, expiresAt: next.expiresAt };
}
