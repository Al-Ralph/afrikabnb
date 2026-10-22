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

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", config.trustProxy);

app.use(httpLogger);
app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));

const limiter = (windowMs, limit) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Trop de requêtes, réessayez plus tard" },
  });

app.use("/api", limiter(15 * 60 * 1000, 300));
app.use(["/api/auth/login", "/api/auth/register"], limiter(15 * 60 * 1000, 10));
// Limite stricte réservée au proxy Nominatim (1 req/s max côté OSM) ; listings-in-bounds
// n'interroge que notre base et est appelé à chaque déplacement de la carte.
app.use(["/api/maps/geocode", "/api/maps/reverse"], limiter(60 * 1000, 30));

app.use(express.json({ limit: "100kb" }));

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "afrikabnb-api" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/listings", listingsRoutes);
app.use("/api/maps", mapsRoutes);
app.use("/api/bookings", bookingsRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Route introuvable" });
});

app.use(errorHandler);

const server = app.listen(config.port, () => {
  logger.info(`AfrikaBnB API listening on http://localhost:${config.port}`);
});

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
