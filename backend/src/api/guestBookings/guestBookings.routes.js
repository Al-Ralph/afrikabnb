import { Router } from "express";
import * as bookingsController from "../bookings/bookings.controller.js";

// Suivi et annulation d'une réservation sans compte, authentifiés par le jeton du lien reçu par
// e-mail (43 caractères base64url ; seul son SHA-256 est stocké). Jeton mal formé, inconnu ou
// expiré : 404 générique. Limite de débit dédiée : voir src/index.js.
const router = Router();

// Le jeton figure dans l'URL : jamais transmis en Referer, jamais mis en cache.
router.use((req, res, next) => {
  res.set({ "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" });
  next();
});

router.get("/:token", bookingsController.getGuest);
router.post("/:token/cancel", bookingsController.cancelGuest);

export default router;
