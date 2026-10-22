import prisma from "../config/db.js";
import { verifyToken } from "../config/jwt.js";

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Token manquant" });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expiré" });
    }
    return res.status(403).json({ error: "Token invalide" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, avatar: true, role: true },
    });
    if (!user) {
      return res.status(401).json({ error: "Utilisateur introuvable" });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

// Authentification facultative : si un token valide est fourni, req.userId est renseigné
// (sans requête en base). Token absent, invalide ou expiré : la requête continue en anonyme.
export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    try {
      const payload = verifyToken(token);
      if (typeof payload.userId === "string") req.userId = payload.userId;
    } catch {
      // Token invalide : traité comme une requête anonyme.
    }
  }
  next();
};
