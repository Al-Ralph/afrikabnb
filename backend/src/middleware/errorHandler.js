import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

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
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    return res.status(status).json({ error: "Erreur serveur" });
  }
  res.status(status).json({ error: message || "Requête invalide" });
};
