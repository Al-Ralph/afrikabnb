import { Router } from "express";
import { z } from "zod";
import * as authController from "./auth.controller.js";
import { authenticateToken } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";

// VARCHAR(254) : longueur maximale d'une adresse email (RFC 5321).
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());

const registerSchema = z
  .object({
    email,
    // bcrypt ignore au-delà de 72 octets.
    password: z.string().min(8).max(72),
    name: z.string().trim().max(100).nullable().optional(),
  })
  .strict();

const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(72),
  })
  .strict();

const forgotPasswordSchema = z.object({ email }).strict();

const resetPasswordSchema = z
  .object({
    // 32 octets en base64url = 43 caractères.
    token: z.string().trim().regex(/^[A-Za-z0-9_-]{43}$/, "Jeton invalide"),
    newPassword: z.string().min(8).max(72),
  })
  .strict();

const router = Router();

router.post("/register", validate(registerSchema), authController.register);
router.post("/login", validate(loginSchema), authController.login);
router.get("/me", authenticateToken, authController.me);
router.post("/forgot-password", validate(forgotPasswordSchema), authController.forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), authController.resetPassword);

export default router;
