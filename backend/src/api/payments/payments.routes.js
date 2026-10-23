// Routes de paiement (monté sur /api). PAYMENTS_ENABLED=false : seule GET /api/payments/config
// existe (-> { enabled: false }) ; toutes les autres routes répondent 404 (non montées).
//
// - POST /api/bookings/:id/payments            voyageur connecté propriétaire -> { paymentUrl, amount… }
// - POST /api/guest-bookings/:token/payments   voyageur sans compte (jeton du lien de suivi)
// - GET  /api/payments/:transactionId/status   page de retour (re-vérifie auprès du prestataire, 10 s min.)
// - GET|POST /api/payments/return?tx=…         return_url CinetPay -> 303 vers /paiement/retour (aucun traitement)
// - GET|POST /api/payments/cinetpay/notify     notify_url CinetPay (HMAC x-token, puis vérification /check)
// - GET  /api/payments/fake/:transactionId     fournisseur simulé (hors production) : page de paiement
// - POST /api/payments/fake/:transactionId/simulate   « accepté / refusé » -> même traitement que la notification
import express, { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { config } from "../../config/env.js";
import { authenticateToken } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { getPaymentProvider, publicPaymentConfig } from "../../services/payments.js";
import { createPaymentsController } from "./payments.controller.js";

const startSchema = z.object({ lang: z.enum(["fr", "en", "es", "de", "pt"]).optional() }).strict();

const limiter = (windowMs, limit) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Trop de requêtes, réessayez plus tard" },
  });

const noStore = (req, res, next) => {
  res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  next();
};

// deps (tests) : { settings, provider, db, appUrl, isProduction }.
export function createPaymentsRouter(deps = {}) {
  const settings = deps.settings ?? config.payments;
  const router = Router();

  router.get("/payments/config", (req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.json(publicPaymentConfig(settings));
  });
  if (!settings.enabled) return router;

  const provider = deps.provider !== undefined ? deps.provider : getPaymentProvider();
  const isProduction = deps.isProduction ?? config.isProduction;
  const controller = createPaymentsController({
    settings,
    provider,
    db: deps.db,
    appUrl: deps.appUrl ?? config.appUrl,
  });
  const form = express.urlencoded({ extended: false, limit: "20kb" });
  const startLimiter = limiter(15 * 60 * 1000, 20);

  router.post("/bookings/:id/payments", startLimiter, validate(startSchema), authenticateToken, controller.startForUser);
  router.post("/guest-bookings/:token/payments", noStore, startLimiter, validate(startSchema), controller.startForGuest);
  router.get("/payments/:transactionId/status", noStore, limiter(60 * 1000, 30), controller.status);
  router.all("/payments/return", form, controller.returnRedirect);

  if (provider?.name === "cinetpay") {
    const notifyLimiter = limiter(60 * 1000, 120);
    // CinetPay vérifie la disponibilité de l'URL par un GET (aucune donnée) : 200.
    router.get("/payments/cinetpay/notify", notifyLimiter, (req, res) => res.status(200).json({ ok: true }));
    router.post("/payments/cinetpay/notify", notifyLimiter, form, controller.cinetpayNotify);
  }
  if (provider?.name === "fake" && !isProduction) {
    router.get("/payments/fake/:transactionId", controller.fakePage);
    router.post("/payments/fake/:transactionId/simulate", form, controller.fakeSimulate);
  }
  return router;
}

export default createPaymentsRouter;
