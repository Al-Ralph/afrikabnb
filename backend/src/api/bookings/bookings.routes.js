import { Router } from "express";
import { z } from "zod";
import * as bookingsController from "./bookings.controller.js";
import * as reviewsController from "../reviews/reviews.controller.js";
import { authenticateToken } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";

const createReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(1).max(1000),
  })
  .strict();

const router = Router();

router.patch("/:id/cancel", authenticateToken, bookingsController.cancel);
// Validation avant authentification : un corps invalide est rejeté (400) sans requête en base.
router.post("/:id/review", validate(createReviewSchema), authenticateToken, reviewsController.create);

export default router;
