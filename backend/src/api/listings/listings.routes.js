import { Router } from "express";
import { z } from "zod";
import * as listingsController from "./listings.controller.js";
import * as bookingsController from "../bookings/bookings.controller.js";
import * as reviewsController from "../reviews/reviews.controller.js";
import * as favoritesController from "../favorites/favorites.controller.js";
import { authenticateToken, optionalAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { day, listingFilterFields, stayOrderRefinement } from "./listings.query.js";
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

const reviewsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

const router = Router();

router.get("/", optionalAuth, validate(listQuerySchema, "query"), listingsController.list);
// Routes "/mine" déclarées avant "/:id".
router.get("/mine", authenticateToken, listingsController.mine);
router.get("/mine/bookings", authenticateToken, listingsController.mineBookings);
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

router.get("/:id/reviews", validate(reviewsQuerySchema, "query"), reviewsController.listForListing);

export default router;
