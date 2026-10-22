import { Amenity, Prisma } from "@prisma/client";
import { z } from "zod";
import { addDays, parseDay } from "../../utils/booking.js";
import { blockingBookingWhere } from "../../utils/bookingStatus.js";

// Équipements reconnus (enum Postgres "Amenity" de prisma/schema.prisma).
export const AMENITIES = Object.values(Amenity);
export const amenityEnum = z.enum(AMENITIES);

// Tris disponibles (`recommended` : plus récentes d'abord, comportement historique).
export const SORTS = ["recommended", "price_asc", "price_desc", "rating_desc"];

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
  // "WIFI,POOL" : annonces possédant TOUS ces équipements.
  amenities: z
    .string()
    .trim()
    .max(600)
    .transform((v) => [...new Set(v.split(",").map((a) => a.trim().toUpperCase()).filter(Boolean))])
    .pipe(z.array(amenityEnum).max(AMENITIES.length))
    .optional(),
  sort: z.enum(SORTS).default("recommended"),
};

// orderBy Prisma du tri (id en dernier critère : pagination stable).
export function listingOrderBy(sort = "recommended") {
  switch (sort) {
    case "price_asc":
      return [{ pricePerNight: "asc" }, { id: "asc" }];
    case "price_desc":
      return [{ pricePerNight: "desc" }, { id: "asc" }];
    case "rating_desc":
      return [{ rating: { sort: "desc", nulls: "last" } }, { reviewCount: "desc" }, { id: "asc" }];
    default:
      return [{ createdAt: "desc" }, { id: "asc" }];
  }
}

export const stayOrderRefinement = [
  (d) => !(d.checkIn && d.checkOut) || d.checkOut > d.checkIn,
  { message: "checkOut doit être postérieur à checkIn", path: ["checkOut"] },
];

// Texte recherché (`q` est un alias de `where`), ou undefined.
export function searchText(query) {
  return query.where || query.q || undefined;
}

// Échappe les jokers de LIKE (\ % _) pour chercher le texte tel quel.
export function escapeLike(text) {
  return text.replace(/[\\%_]/g, "\\$&");
}

// Ids des annonces dont le titre ou la ville contient le texte, sans tenir compte de la casse
// ni des accents ("Lome" trouve "Lomé"). Prisma ne sait pas faire `unaccent` : requête brute
// paramétrée (extension unaccent activée par la migration 20261022120000_unaccent).
export async function findListingIdsByText(prisma, text) {
  const pattern = `%${escapeLike(text)}%`;
  const rows = await prisma.$queryRaw`
    SELECT "id" FROM "Listing"
    WHERE unaccent(lower("title")) LIKE unaccent(lower(${pattern}))
       OR unaccent(lower("location")) LIKE unaccent(lower(${pattern}))`;
  return rows.map((r) => r.id);
}

// Construit le `where` Prisma à partir des filtres validés. `textMatchIds` : résultat de
// findListingIdsByText ; sans lui, repli sur ILIKE (insensible à la casse, pas aux accents).
// Recherche publique : uniquement les annonces ACTIVE (les HIDDEN sont modérées).
export function buildListingWhere(query, { textMatchIds, now = new Date() } = {}) {
  const { categoryId, minPrice, maxPrice, pets, guests, checkIn, checkOut, amenities } = query;
  const where = { status: "ACTIVE" };
  const text = searchText(query);
  if (text && textMatchIds) {
    where.id = { in: textMatchIds };
  } else if (text) {
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
  if (amenities?.length) where.amenities = { hasEvery: amenities };
  if (checkIn || checkOut) {
    // Une seule date fournie : on vérifie la nuit correspondante.
    const start = checkIn ?? addDays(checkOut, -1);
    const end = checkOut ?? addDays(checkIn, 1);
    // Réservations bloquantes (CONFIRMED, PENDING non expirée) et dates bloquées par l'hôte.
    where.bookings = {
      none: {
        ...blockingBookingWhere(now),
        checkIn: { lt: parseDay(end) },
        checkOut: { gt: parseDay(start) },
      },
    };
    where.blockedPeriods = {
      none: { startDate: { lt: parseDay(end) }, endDate: { gt: parseDay(start) } },
    };
  }
  return where;
}
