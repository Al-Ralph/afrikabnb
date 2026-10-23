import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { logger, maskSensitiveUrl } from "../config/logger.js";

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Données invalides",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  let status = err.statusCode || err.status || 500;
  let message = err.message;

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      status = 409;
      message = "Ressource déjà existante";
    } else if (
      err.code === "P2034" ||
      // Requête brute ($queryRaw) en échec : code SQLSTATE PostgreSQL dans meta.code
      // (40001 = échec de sérialisation, 40P01 = interblocage détecté).
      (err.code === "P2010" && ["40001", "40P01"].includes(err.meta?.code))
    ) {
      // Conflit d'écriture / interblocage entre transactions concurrentes.
      status = 409;
      message = "Conflit avec une opération concurrente, réessayez";
    } else if (err.code === "P2025") {
      status = 404;
      message = "Ressource introuvable";
    } else {
      status = 500;
    }
  }

  if (status >= 500) {
    // req.log (pino-http) porte déjà l'id de requête ; repli sur le logger racine hors requête HTTP.
    (req.log || logger).error({ err, reqId: req.id }, `${req.method} ${maskSensitiveUrl(req.originalUrl)} : erreur serveur`);
    // `expose: true` : message métier volontairement public (ex. prestataire de paiement indisponible) ;
    // toute autre erreur 5xx reste générique.
    const error = err.expose === true && err.message ? err.message : "Erreur serveur";
    return res.status(status).json({ error, requestId: req.id });
  }
  res.status(status).json({ error: message || "Requête invalide" });
};
