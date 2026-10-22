import { Router } from "express";
import { z } from "zod";
import * as mapsController from "./maps.controller.js";
import { validate } from "../../middleware/validate.js";
import { listingFilterFields, stayOrderRefinement } from "../listings/listings.query.js";

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);

const geocodeSchema = z.object({
  address: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

const reverseSchema = z.object({ lat, lon: lng });

// Mêmes filtres facultatifs que GET /api/listings (where, categoryId, pets, guests, checkIn, checkOut...).
const boundsSchema = z
  .object({ neLat: lat, neLng: lng, swLat: lat, swLng: lng, ...listingFilterFields })
  .refine(...stayOrderRefinement);

const router = Router();

router.get("/geocode", validate(geocodeSchema, "query"), mapsController.geocode);
router.get("/reverse", validate(reverseSchema, "query"), mapsController.reverseGeocode);
router.get("/listings-in-bounds", validate(boundsSchema, "query"), mapsController.listingsInBounds);

export default router;
