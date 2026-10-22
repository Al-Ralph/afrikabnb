import prisma from "../config/db.js";
import { verifyToken } from "../config/jwt.js";
import { isTokenRevokedByPasswordChange } from "../utils/resetToken.js";
import { hasAppHeader } from "../utils/refreshToken.js";

function bearerToken(req) {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

// Vérifie la présence et la signature du token. Retourne { payload } ou { status, error }.
function checkToken(req) {
  const token = bearerToken(req);
  if (!token) return { status: 401, error: "Token manquant" };
  try {
    return { payload: verifyToken(token) };
  } catch (err) {
    if (err.name === "TokenExpiredError") return { status: 401, error: "Token expiré" };
    return { status: 403, error: "Token invalide" };
  }
}

// 401 dû au jeton d'accès (absent, expiré, révoqué) : signalé par WWW-Authenticate (RFC 6750) pour
// que le frontend tente un renouvellement, contrairement aux autres 401 (mot de passe actuel faux…).
const tokenRejected = (res, error) =>
  res.status(401).set("WWW-Authenticate", 'Bearer error="invalid_token"').json({ error });

export const authenticateToken = async (req, res, next) => {
  const { payload, status, error } = checkToken(req);
  if (!payload) return status === 401 ? tokenRejected(res, error) : res.status(status).json({ error });

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, avatar: true, role: true, passwordChangedAt: true },
    });
    if (!user) {
      return tokenRejected(res, "Utilisateur introuvable");
    }
    // Token émis avant la dernière réinitialisation du mot de passe : révoqué.
    if (isTokenRevokedByPasswordChange(payload.iat, user.passwordChangedAt)) {
      return tokenRejected(res, "Session expirée, reconnectez-vous");
    }
    const { passwordChangedAt: _, ...publicUser } = user;
    req.user = publicUser;
    next();
  } catch (err) {
    next(err);
  }
};

// Authentification facultative : si un token valide ET non révoqué est fourni, req.userId est
// renseigné (l'utilisateur est relu en base). Token absent, invalide, expiré ou révoqué, ou
// utilisateur inexistant : la requête continue en anonyme, sans erreur.
export const optionalAuth = async (req, res, next) => {
  const token = bearerToken(req);
  if (token) {
    try {
      const payload = verifyToken(token);
      if (typeof payload.userId === "string") {
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: { id: true, passwordChangedAt: true },
        });
        if (user && !isTokenRevokedByPasswordChange(payload.iat, user.passwordChangedAt)) req.userId = user.id;
      }
    } catch (err) {
      // Token invalide : anonyme. Panne de base : on ne dégrade pas en anonyme silencieusement.
      if (err.name !== "JsonWebTokenError" && err.name !== "TokenExpiredError" && err.name !== "NotBeforeError") {
        return next(err);
      }
    }
  }
  next();
};

// Routes à cookie (/api/auth/refresh, /api/auth/logout) : exige X-Requested-With: afrikabnb.
// Un formulaire ou une image d'un autre site ne peut pas poser cet en-tête ; un fetch inter-origine
// qui le pose déclenche un preflight CORS refusé. Défense en plus de SameSite=Strict.
export const requireAppHeader = (req, res, next) => {
  if (!hasAppHeader(req)) return res.status(403).json({ error: "En-tête X-Requested-With requis" });
  next();
};
