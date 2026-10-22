// À placer après authenticateToken : 401 sans utilisateur, 403 si son rôle n'est pas autorisé.
export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentification requise" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Accès réservé" });
    next();
  };
