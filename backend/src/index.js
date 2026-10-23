import { config } from "./config/env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { logger, httpLogger } from "./config/logger.js";
import prisma from "./config/db.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./api/auth/auth.routes.js";
import usersRoutes from "./api/users/users.routes.js";
import listingsRoutes from "./api/listings/listings.routes.js";
import mapsRoutes from "./api/maps/maps.routes.js";
import bookingsRoutes from "./api/bookings/bookings.routes.js";
import adminRoutes from "./api/admin/admin.routes.js";
import guestBookingsRoutes from "./api/guestBookings/guestBookings.routes.js";
import ratesRoutes from "./api/rates/rates.routes.js";
import { createPaymentsRouter } from "./api/payments/payments.routes.js";
import { startPaymentReconciler } from "./api/payments/payments.reconciler.js";
import { UPLOADS_DIR } from "./services/storage/index.js";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", config.trustProxy);

app.use(httpLogger);
app.use(helmet());
// credentials : cookie de session (afrikabnb_rt) ; origines explicites uniquement (jamais "*",
// refusé par src/config/env.js).
app.use(cors({ origin: config.corsOrigins, credentials: true, exposedHeaders: ["WWW-Authenticate"] }));

const limiter = (windowMs, limit, skip) =>
  rateLimit({
    windowMs,
    limit,
    skip,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Trop de requêtes, réessayez plus tard" },
  });

// Notifications CinetPay exclues de la limite globale (serveurs du prestataire, protégées par le
// HMAC x-token) : limite dédiée dans api/payments/payments.routes.js.
app.use("/api", limiter(15 * 60 * 1000, 300, (req) => req.path === "/payments/cinetpay/notify"));
const uploadLimiter = limiter(15 * 60 * 1000, 30);
app.use(["/api/auth/login", "/api/auth/register"], limiter(15 * 60 * 1000, 10));
// Limite stricte réservée au proxy Nominatim (1 req/s max côté OSM) ; listings-in-bounds
// n'interroge que notre base et est appelé à chaque déplacement de la carte.
app.use(["/api/maps/geocode", "/api/maps/reverse"], limiter(60 * 1000, 30));
// Mot de passe oublié : limite stricte (envoi d'emails, anti-énumération / anti-spam).
app.use("/api/auth/forgot-password", limiter(15 * 60 * 1000, 5));
app.use("/api/auth/reset-password", limiter(15 * 60 * 1000, 10));
// Renouvellement de session : un appel par chargement de page / expiration du jeton d'accès.
app.use("/api/auth/refresh", limiter(15 * 60 * 1000, 60));
// Téléversement de photos (traitement sharp coûteux).
app.use("/api/listings/:id/images", (req, res, next) => (req.method === "POST" ? uploadLimiter(req, res, next) : next()));
// Suivi des réservations sans compte (jeton dans l'URL) : limite stricte contre l'énumération.
app.use("/api/guest-bookings", limiter(15 * 60 * 1000, 30));

app.use(express.json({ limit: "100kb" }));

// Stockage « local » (développement) : photos servies en statique, sans listing de dossier ni
// fichiers cachés. CORP cross-origin : le frontend (autre origine en dev) peut afficher les images.
if (config.storage.driver === "local") {
  app.use(
    "/uploads",
    express.static(UPLOADS_DIR, {
      index: false,
      dotfiles: "deny",
      redirect: false,
      fallthrough: true,
      maxAge: "7d",
      immutable: true,
      setHeaders(res) {
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; sandbox");
      },
    })
  );
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "afrikabnb-api" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/listings", listingsRoutes);
app.use("/api/maps", mapsRoutes);
app.use("/api/bookings", bookingsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/guest-bookings", guestBookingsRoutes);
app.use("/api/rates", ratesRoutes);
// Paiements (PAYMENTS_ENABLED) : seule GET /api/payments/config existe si désactivés.
app.use("/api", createPaymentsRouter());

app.use((req, res) => {
  res.status(404).json({ error: "Route introuvable" });
});

app.use(errorHandler);

const server = app.listen(config.port, () => {
  logger.info(`AfrikaBnB API listening on http://localhost:${config.port}`);
});

// Réconciliation périodique des paiements (PAYMENTS_ENABLED, hors NODE_ENV=test) : non bloquante.
startPaymentReconciler({ settings: config.payments, nodeEnv: config.nodeEnv, log: logger });

function shutdown(signal) {
  logger.info(`${signal} reçu, arrêt de l'API...`);
  setTimeout(() => process.exit(1), 10000).unref();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
