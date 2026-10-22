import { Router } from "express";
import { z } from "zod";
import * as listingsController from "./listings.controller.js";
import * as bookingsController from "../bookings/bookings.controller.js";
import * as reviewsController from "../reviews/reviews.controller.js";
import * as favoritesController from "../favorites/favorites.controller.js";
import * as imagesController from "./images.controller.js";
import * as blockedPeriodsController from "./blockedPeriods.controller.js";
import { authenticateToken, optionalAuth } from "../../middleware/auth.js";
import { requireListingOwner } from "../../middleware/listingOwner.js";
import { acquireUploadSlot } from "../../middleware/uploadSlot.js";
import { validate } from "../../middleware/validate.js";
import { receiveImages, MAX_IMAGES_PER_LISTING } from "../../middleware/upload.js";
import { amenityEnum, day, listingFilterFields, stayOrderRefinement } from "./listings.query.js";
import { MAX_NIGHTS, nightsBetween, todayDay } from "../../utils/booking.js";

// Longueurs maximales identiques aux colonnes VARCHAR de prisma/schema.prisma.
const text = (max) => z.string().trim().max(max);

const listingFields = {
  title: text(200).min(1),
  description: text(5000).nullable().optional(),
  location: text(200).min(1),
  address: text(300).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  // DECIMAL(10, 2)
  pricePerNight: z.number().positive().max(99999999.99),
  // Code devise ISO 4217 (XOF, EUR, USD...).
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Code devise ISO 4217 attendu (ex. XOF)")
    .optional(),
  maxGuests: z.number().int().min(1).max(50).optional(),
  bedrooms: z.number().int().min(0).max(50).optional(),
  imageUrl: z.url({ protocol: /^https$/ }).max(2048).nullable().optional(),
  categoryId: text(50).min(1).nullable().optional(),
  acceptsPets: z.boolean().optional(),
  // Équipements (doublons retirés).
  amenities: z
    .array(amenityEnum)
    .max(50)
    .transform((a) => [...new Set(a)])
    .optional(),
  // false : réservations soumises à l'acceptation de l'hôte (PENDING, 48 h).
  instantBook: z.boolean().optional(),
};

// `rating` et `reviewCount` ne sont volontairement pas acceptés : ils sont calculés à partir des avis.
const createListingSchema = z.object(listingFields).strict();
const updateListingSchema = z.object(listingFields).partial().strict();

const listQuerySchema = z
  .object({
    ...listingFilterFields,
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine(...stayOrderRefinement);

const createBookingSchema = z
  .object({
    checkIn: day,
    checkOut: day,
    guests: z.number().int().min(1).max(50),
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

const availabilityQuerySchema = z
  .object({ from: day.optional(), to: day.optional() })
  .refine((d) => !(d.from && d.to) || d.to > d.from, {
    message: "`to` doit être postérieur à `from`",
    path: ["to"],
  })
  .refine((d) => !(d.from && d.to) || nightsBetween(d.from, d.to) <= 2 * MAX_NIGHTS, {
    message: `Période limitée à ${2 * MAX_NIGHTS} jours`,
    path: ["to"],
  });

const reorderImagesSchema = z
  .object({ imageIds: z.array(z.string().min(1).max(64)).min(1).max(MAX_IMAGES_PER_LISTING) })
  .strict()
  .refine((d) => new Set(d.imageIds).size === d.imageIds.length, {
    message: "imageIds contient des doublons",
    path: ["imageIds"],
  });

const blockedPeriodSchema = z
  .object({
    startDate: day,
    endDate: day,
    reason: z.string().trim().max(200).nullable().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.startDate < todayDay()) {
      ctx.addIssue({ code: "custom", path: ["startDate"], message: "startDate ne peut pas être dans le passé" });
    }
    const nights = nightsBetween(d.startDate, d.endDate);
    if (nights < 1) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "endDate doit être postérieur à startDate" });
    } else if (nights > MAX_NIGHTS) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: `Période limitée à ${MAX_NIGHTS} jours` });
    }
  });

const blockedPeriodsQuerySchema = z.object({ from: day.optional() });

const reviewsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

const router = Router();

router.get("/", optionalAuth, validate(listQuerySchema, "query"), listingsController.list);
// Routes "/mine" déclarées avant "/:id".
router.get("/mine", authenticateToken, listingsController.mine);
router.get("/mine/bookings", authenticateToken, listingsController.mineBookings);
router.get("/mine/stats", authenticateToken, listingsController.mineStats);
router.get("/price-range", listingsController.priceRange);
router.get("/:id", optionalAuth, listingsController.getById);
router.post("/", authenticateToken, validate(createListingSchema), listingsController.create);
router.patch("/:id", authenticateToken, validate(updateListingSchema), listingsController.update);
router.delete("/:id", authenticateToken, listingsController.remove);

router.post("/:id/favorite", authenticateToken, favoritesController.add);
router.delete("/:id/favorite", authenticateToken, favoritesController.remove);

// Validation avant authentification : un corps invalide est rejeté (400) sans requête en base.
router.post(
  "/:id/bookings",
  validate(createBookingSchema),
  authenticateToken,
  bookingsController.create
);
router.get(
  "/:id/availability",
  validate(availabilityQuerySchema, "query"),
  bookingsController.availability
);

// Photos. Ordre des contrôles du téléversement : authentification complète (utilisateur en base),
// propriété de l'annonce, place disponible (2 envois simultanés max), PUIS réception multipart
// avec limites (taille, nombre) et type réel par magic bytes.
router.post(
  "/:id/images",
  authenticateToken,
  requireListingOwner,
  acquireUploadSlot,
  receiveImages,
  imagesController.upload
);
// "/order" déclaré avant "/:imageId".
router.patch(
  "/:id/images/order",
  validate(reorderImagesSchema),
  authenticateToken,
  imagesController.reorder
);
router.delete("/:id/images/:imageId", authenticateToken, imagesController.remove);

// Dates bloquées par l'hôte (propriétaire uniquement ; le public les voit via /availability).
router.get(
  "/:id/blocked-periods",
  authenticateToken,
  validate(blockedPeriodsQuerySchema, "query"),
  blockedPeriodsController.list
);
router.post(
  "/:id/blocked-periods",
  validate(blockedPeriodSchema),
  authenticateToken,
  blockedPeriodsController.create
);
router.delete("/:id/blocked-periods/:periodId", authenticateToken, blockedPeriodsController.remove);

router.get("/:id/reviews", validate(reviewsQuerySchema, "query"), reviewsController.listForListing);

export default router;
