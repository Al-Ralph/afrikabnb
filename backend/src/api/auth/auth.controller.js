import bcrypt from "bcryptjs";
import prisma from "../../config/db.js";
import { httpError } from "../../utils/httpError.js";
import { checkResetToken, generateResetToken, hashResetToken } from "../../utils/resetToken.js";
import { appLink, sendEmailInBackground } from "../../services/email/index.js";
import { passwordResetEmail } from "../../services/email/templates.js";
import { signToken } from "../../config/jwt.js";
import { readRefreshCookie, hashRefreshToken } from "../../utils/refreshToken.js";
import {
  clearRefreshCookie,
  publicUserSelect,
  requestUserAgent,
  revokeAllForUser,
  rotateRefreshToken,
  setRefreshCookie,
  startSession,
} from "./session.js";

export const SALT_ROUNDS = 12;
// Hash factice : compare() prend le même temps que l'utilisateur existe ou non (anti-timing).
const DUMMY_HASH = bcrypt.hashSync("afrikabnb-timing-dummy", SALT_ROUNDS);

const publicUser = publicUserSelect;

export async function register(req, res, next) {
  try {
    const { email, password, name } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Cet email est déjà utilisé" });
    }
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: { email, password: hashed, name: name || null },
      select: publicUser,
    });
    const token = await startSession(req, res, user.id);
    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
    if (!user || !valid) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }
    const token = await startSession(req, res, user.id);
    const { id, name, avatar, role } = user;
    res.json({ user: { id, email: user.email, name, avatar, role }, token });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    res.json({ user: req.user });
  } catch (err) {
    next(err);
  }
}

export const FORGOT_PASSWORD_MESSAGE =
  "Si un compte existe pour cet email, un lien de réinitialisation vient d'être envoyé.";

// POST /api/auth/forgot-password : toujours la même réponse 200 (pas d'énumération des comptes).
// La réponse part avant tout accès à la base : son délai ne dépend pas de l'existence du compte.
export async function forgotPassword(req, res) {
  res.json({ message: FORGOT_PASSWORD_MESSAGE });
  const { email } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });
    if (!user) {
      req.log.info("[auth] mot de passe oublié : email inconnu");
      return;
    }
    const { token, tokenHash, expiresAt } = generateResetToken();
    const now = new Date();
    // Un seul jeton valide à la fois : les précédents sont invalidés.
    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
      prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } }),
    ]);
    const resetUrl = appLink(`/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}`);
    req.log.info({ userId: user.id }, "[auth] jeton de réinitialisation créé");
    sendEmailInBackground({ to: user.email, ...passwordResetEmail({ name: user.name, resetUrl }) }, req.log);
  } catch (err) {
    req.log.error({ err }, "[auth] mot de passe oublié : échec");
  }
}

// POST /api/auth/reset-password : jeton valide (empreinte, non expiré, non utilisé) -> nouveau
// mot de passe, jeton consommé, autres jetons invalidés, sessions antérieures révoquées.
export async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body;
    const tokenHash = hashResetToken(token);
    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const record = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
      const check = checkResetToken(record, token, now);
      if (!check.ok) throw httpError(400, "Lien de réinitialisation invalide ou expiré");
      // Consommation atomique : une seconde utilisation concurrente du même jeton échoue.
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw httpError(400, "Lien de réinitialisation invalide ou expiré");
      await tx.user.update({
        where: { id: record.userId },
        data: { password: hashed, passwordChangedAt: now },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: now },
      });
      // Toutes les sessions (jetons de renouvellement) de l'utilisateur sont fermées.
      await revokeAllForUser(tx, record.userId, now);
      req.log.info({ userId: record.userId }, "[auth] mot de passe réinitialisé");
    });
    res.json({ message: "Mot de passe modifié. Vous pouvez vous connecter." });
  } catch (err) {
    next(err);
  }
}

const REFRESH_ERRORS = {
  missing: "Session absente, reconnectez-vous",
  reused: "Session révoquée, reconnectez-vous",
  default: "Session expirée, reconnectez-vous",
};

// POST /api/auth/refresh : rotation du jeton de renouvellement (cookie), nouveau jeton d'accès.
export async function refresh(req, res, next) {
  try {
    const raw = readRefreshCookie(req);
    if (!raw) return res.status(401).json({ error: REFRESH_ERRORS.missing });
    const result = await rotateRefreshToken(prisma, raw, { userAgent: requestUserAgent(req) });
    if (!result.ok) {
      clearRefreshCookie(res);
      if (result.reason === "reused") {
        req.log.warn({ userId: result.userId }, "[auth] réutilisation d'un jeton de renouvellement : famille révoquée");
      }
      return res.status(401).json({ error: REFRESH_ERRORS[result.reason] || REFRESH_ERRORS.default });
    }
    setRefreshCookie(res, result.token);
    res.json({ token: signToken(result.user.id), user: result.user });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/logout : révoque le jeton du cookie (s'il existe), efface le cookie. Toujours 204.
export async function logout(req, res) {
  const raw = readRefreshCookie(req);
  if (raw) {
    try {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashRefreshToken(raw), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch (err) {
      req.log.error({ err }, "[auth] déconnexion : révocation impossible");
    }
  }
  clearRefreshCookie(res);
  res.status(204).end();
}

// POST /api/auth/logout-all (auth) : révoque toutes les sessions de l'utilisateur.
export async function logoutAll(req, res, next) {
  try {
    await revokeAllForUser(prisma, req.user.id);
    req.log.info({ userId: req.user.id }, "[auth] déconnexion de tous les appareils");
    clearRefreshCookie(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
