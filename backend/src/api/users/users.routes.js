import { Router } from "express";
import { z } from "zod";
import * as usersController from "./users.controller.js";
import * as favoritesController from "../favorites/favorites.controller.js";
import * as bookingsController from "../bookings/bookings.controller.js";
import { authenticateToken } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(100).nullable().optional(),
    avatar: z
      .url({ protocol: /^https$/ })
      .max(2048)
      .nullable()
      .optional(),
    currentPassword: z.string().min(1).max(72).optional(),
    newPassword: z.string().min(8).max(72).optional(),
  })
  .strict()
  .refine((d) => d.newPassword === undefined || d.currentPassword !== undefined, {
    message: "currentPassword est requis pour changer de mot de passe",
    path: ["currentPassword"],
  });

const router = Router();

router.use(authenticateToken);
router.get("/me", usersController.getProfile);
router.patch("/me", validate(updateProfileSchema), usersController.updateProfile);
router.get("/me/favorites", favoritesController.listMine);
router.get("/me/bookings", bookingsController.listMine);

export default router;
