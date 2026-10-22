import { Prisma } from "@prisma/client";
import { z } from "zod";
import { addDays, parseDay } from "../../utils/booking.js";

// Jour calendaire "YYYY-MM-DD" (date réelle : 2026-02-30 est refusé).
export const day = z.iso.date({ message: "Date attendue au format YYYY-MM-DD" });

// Filtres de recherche communs à GET /api/listings et GET /api/maps/listings-in-bounds.
export const listingFilterFields = {
  // Recherche texte sur location ou title (`q` est un alias de `where`).
  where: z.string().trim().max(100).optional(),
  q: z.string().trim().max(100).optional(),
  categoryId: z.string().trim().max(50).optional(),
  pets: z.enum(["0", "1", "true", "false"]).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  // Capacité : annonces avec maxGuests >= guests.
  guests: z.coerce.number().int().min(1).max(100).optional(),
  // Disponibilité : exclut les annonces ayant une réservation non annulée qui chevauche.
  checkIn: day.optional(),
  checkOut: day.optional(),
};

export const stayOrderRefinement = [
  (d) => !(d.checkIn && d.checkOut) || d.checkOut > d.checkIn,
  { message: "checkOut doit être postérieur à checkIn", path: ["checkOut"] },
];

// Construit le `where` Prisma à partir des filtres validés.
export function buildListingWhere(query) {
  const { where: search, q, categoryId, minPrice, maxPrice, pets, guests, checkIn, checkOut } = query;
  const where = {};
  const text = search ?? q;
  // PostgreSQL : `contains` (LIKE) est sensible à la casse, `mode: "insensitive"` utilise ILIKE.
  if (text) {
    where.OR = [
      { location: { contains: text, mode: "insensitive" } },
      { title: { contains: text, mode: "insensitive" } },
    ];
  }
  if (categoryId) where.categoryId = categoryId;
  if (pets === "1" || pets === "true") where.acceptsPets = true;
  if (guests != null) where.maxGuests = { gte: guests };
  if (minPrice != null || maxPrice != null) {
    where.pricePerNight = {};
    if (minPrice != null) where.pricePerNight.gte = new Prisma.Decimal(minPrice);
    if (maxPrice != null) where.pricePerNight.lte = new Prisma.Decimal(maxPrice);
  }
  if (checkIn || checkOut) {
    // Une seule date fournie : on vérifie la nuit correspondante.
    const start = checkIn ?? addDays(checkOut, -1);
    const end = checkOut ?? addDays(checkIn, 1);
    where.bookings = {
      none: {
        status: { not: "CANCELLED" },
        checkIn: { lt: parseDay(end) },
        checkOut: { gt: parseDay(start) },
      },
    };
  }
  return where;
}
