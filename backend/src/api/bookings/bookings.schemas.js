// Schémas et gardes de la création de réservation (connectée ou sans compte).
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { day } from "../listings/listings.query.js";
import { MAX_NIGHTS, nightsBetween, todayDay } from "../../utils/booking.js";

// Caractères de contrôle et de réordonnancement bidirectionnel interdits dans les champs d'une
// ligne (affichés à l'hôte et dans les e-mails : pas d'usurpation visuelle).
const NO_CONTROL = /^[^\p{Cc}‪-‮⁦-⁩]*$/u;
// Message : retours à la ligne autorisés, autres contrôles interdits.
const NO_CONTROL_EXCEPT_NEWLINE = /^[^\0-\x09\x0B\x0C\x0E-\x1F\x7F‪-‮⁦-⁩]*$/u;

const emptyToUndefined = (v) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const contactSchema = z
  .object({
    name: z.string().trim().min(2, "Nom trop court").max(100).regex(NO_CONTROL, "Caractères non autorisés"),
    // VARCHAR(254), normalisé en minuscules (quota des demandes sans compte par adresse).
    email: z.string().trim().toLowerCase().max(254).pipe(z.email("Adresse e-mail invalide")),
    // Format international souple : chiffres, espaces, + initial, . - ( ) ; 6 à 15 chiffres (E.164).
    phone: z
      .string()
      .trim()
      .max(32)
      .regex(/^\+?[0-9][0-9 ().-]*$/, "Numéro de téléphone invalide")
      .refine((v) => {
        const digits = v.replace(/\D/g, "").length;
        return digits >= 6 && digits <= 15;
      }, "Numéro de téléphone invalide"),
    // Code ISO 3166-1 alpha-2.
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Code pays ISO 3166-1 alpha-2 attendu"),
    arrivalTime: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure attendue au format HH:MM")
        .optional()
    ),
    message: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(1000).regex(NO_CONTROL_EXCEPT_NEWLINE, "Caractères non autorisés").optional()
    ),
  })
  .strict();

export const createBookingSchema = z
  .object({
    checkIn: day,
    checkOut: day,
    guests: z.number().int().min(1).max(50),
    contact: contactSchema,
    acceptTerms: z.literal(true, "Vous devez accepter les conditions"),
    // Champ piège : vérifié (vide) par rejectHoneypot avant ce schéma.
    website: z.string().max(0).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.checkIn < todayDay()) {
      ctx.addIssue({ code: "custom", path: ["checkIn"], message: "checkIn ne peut pas être dans le passé" });
    }
    const nights = nightsBetween(d.checkIn, d.checkOut);
    if (nights < 1) {
      ctx.addIssue({ code: "custom", path: ["checkOut"], message: "checkOut doit être postérieur à checkIn" });
    } else if (nights > MAX_NIGHTS) {
      ctx.addIssue({ code: "custom", path: ["checkOut"], message: `Séjour limité à ${MAX_NIGHTS} nuits` });
    }
  });

// Champ piège anti-robot `website` (invisible pour un humain) : rempli -> 400 générique, sans
// détail de validation ni accès à la base. Placé AVANT la validation du corps.
export const rejectHoneypot = (req, res, next) => {
  const trap = req.body?.website;
  if (trap !== undefined && trap !== null && trap !== "") {
    req.log?.warn("[réservation] champ piège rempli");
    return res.status(400).json({ error: "Requête invalide" });
  }
  next();
};

// Réservations sans compte : 5 réservations créées par heure et par IP (les requêtes en échec,
// ex. 409 dates prises, ne sont pas décomptées). Les membres connectés n'y sont pas soumis.
// Placé APRÈS optionalAuth : un faux en-tête Authorization ne permet pas de contourner la limite.
export const ANONYMOUS_BOOKINGS_PER_HOUR = 5;
const anonymousLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: ANONYMOUS_BOOKINGS_PER_HOUR,
  skipFailedRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Trop de réservations sans compte depuis cette connexion, réessayez plus tard" },
});

export const limitAnonymousBookings = (req, res, next) => (req.userId ? next() : anonymousLimiter(req, res, next));
