import { Router } from "express";
import { z } from "zod";
import * as adminController from "./admin.controller.js";
import { authenticateToken } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";

const pagination = {
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
};

const usersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(["GUEST", "HOST", "ADMIN"]).optional(),
  ...pagination,
});

const listingsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "HIDDEN"]).optional(),
  ...pagination,
});

const reviewsQuerySchema = z.object(pagination);

const roleSchema = z.object({ role: z.enum(["GUEST", "HOST", "ADMIN"]) }).strict();
const listingStatusSchema = z.object({ status: z.enum(["ACTIVE", "HIDDEN"]) }).strict();

const router = Router();

// Toutes les routes : utilisateur authentifié ET rôle ADMIN (401 / 403 sinon).
router.use(authenticateToken, requireRole("ADMIN"));

router.get("/stats", adminController.stats);
router.get("/users", validate(usersQuerySchema, "query"), adminController.users);
router.patch("/users/:id/role", validate(roleSchema), adminController.updateUserRole);
router.get("/listings", validate(listingsQuerySchema, "query"), adminController.listings);
router.patch("/listings/:id/status", validate(listingStatusSchema), adminController.updateListingStatus);
router.get("/reviews", validate(reviewsQuerySchema, "query"), adminController.reviews);
router.delete("/reviews/:id", adminController.deleteReview);

export default router;
