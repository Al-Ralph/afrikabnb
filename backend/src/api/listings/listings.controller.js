import { Prisma } from "@prisma/client";
import prisma from "../../config/db.js";
import { addDays, parseDay, todayDay } from "../../utils/booking.js";
import { blockingBookingWhere } from "../../utils/bookingStatus.js";
import { computeHostStats } from "../../utils/hostStats.js";
import { buildListingWhere, findListingIdsByText, listingOrderBy, searchText } from "./listings.query.js";
import { listingBaseInclude, listingToJson } from "./listings.serializers.js";
import { bookingToJson, hostBookingInclude, sweepExpired } from "../bookings/bookings.controller.js";
import { removeFromStorage, setExternalCover, storagePathsOf, syncCoverImage } from "./images.controller.js";

// Inclut le statut favori uniquement pour un utilisateur authentifié (optionalAuth).
function listingInclude(userId) {
  const include = { ...listingBaseInclude };
  if (userId) include.favorites = { where: { userId }, select: { id: true } };
  return include;
}

// Fourchette de prix globale des annonces publiques (curseurs du front), indépendante des filtres.
export async function priceRangeOf(client = prisma) {
  const agg = await client.listing.aggregate({
    where: { status: "ACTIVE" },
    _min: { pricePerNight: true },
    _max: { pricePerNight: true },
  });
  const n = (v) => (v != null ? Number(v) : null);
  return { min: n(agg._min.pricePerNight), max: n(agg._max.pricePerNight) };
}

export async function list(req, res, next) {
  try {
    const { limit, offset, sort } = req.query;
    const text = searchText(req.query);
    const textMatchIds = text ? await findListingIdsByText(prisma, text) : undefined;
    const where = buildListingWhere(req.query, { textMatchIds });
    const [listings, total, priceRange] = await Promise.all([
      prisma.listing.findMany({
        where,
        include: listingInclude(req.userId),
        orderBy: listingOrderBy(sort),
        take: limit,
        skip: offset,
      }),
      prisma.listing.count({ where }),
      priceRangeOf(),
    ]);
    res.json({ data: listings.map(listingToJson), total, limit, offset, priceRange });
  } catch (err) {
    next(err);
  }
}

// GET /api/listings/price-range
export async function priceRange(req, res, next) {
  try {
    res.json(await priceRangeOf());
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      include: listingInclude(req.userId),
    });
    if (!listing) return res.status(404).json({ error: "Annonce introuvable" });
    // Annonce masquée : visible uniquement par son hôte et les administrateurs.
    if (listing.status !== "ACTIVE" && listing.hostId !== req.userId) {
      const viewer = req.userId
        ? await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true } })
        : null;
      if (viewer?.role !== "ADMIN") return res.status(404).json({ error: "Annonce introuvable" });
    }
    res.json(listingToJson(listing));
  } catch (err) {
    next(err);
  }
}

// Annonces de l'utilisateur connecté, avec le nombre de réservations en cours ou à venir.
export async function mine(req, res, next) {
  try {
    const listings = await prisma.listing.findMany({
      where: { hostId: req.user.id },
      include: {
        ...listingBaseInclude,
        _count: {
          select: {
            bookings: { where: { ...blockingBookingWhere(), checkOut: { gt: parseDay(todayDay()) } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: listings.map(listingToJson) });
  } catch (err) {
    next(err);
  }
}

// Réservations reçues sur les annonces de l'utilisateur connecté.
export async function mineBookings(req, res, next) {
  try {
    await sweepExpired({ listing: { hostId: req.user.id } });
    const bookings = await prisma.booking.findMany({
      where: { listing: { hostId: req.user.id } },
      include: hostBookingInclude,
      orderBy: { checkIn: "desc" },
    });
    res.json({ data: bookings.map((b) => bookingToJson(b)) });
  } catch (err) {
    next(err);
  }
}

// GET /api/listings/mine/stats : tableau de bord hôte.
export async function mineStats(req, res, next) {
  try {
    const today = todayDay();
    const [listings, bookings, upcoming, pendingRequests] = await Promise.all([
      prisma.listing.findMany({
        where: { hostId: req.user.id },
        select: { id: true, title: true, currency: true, rating: true, reviewCount: true, status: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.booking.findMany({
        where: { status: "CONFIRMED", listing: { hostId: req.user.id } },
        select: { listingId: true, checkIn: true, checkOut: true, totalPrice: true },
      }),
      prisma.booking.findMany({
        where: {
          listing: { hostId: req.user.id },
          ...blockingBookingWhere(),
          checkIn: { gte: parseDay(today), lt: parseDay(addDays(today, 90)) },
        },
        include: hostBookingInclude,
        orderBy: { checkIn: "asc" },
        take: 10,
      }),
      prisma.booking.count({
        where: { listing: { hostId: req.user.id }, ...blockingBookingWhere(), status: "PENDING" },
      }),
    ]);
    const stats = computeHostStats({ listings, bookings, today });
    res.json({
      ...stats,
      listingsCount: listings.length,
      pendingRequests,
      upcomingArrivals: upcoming.map((b) => bookingToJson(b)),
    });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { pricePerNight, acceptsPets, imageUrl, ...fields } = req.body;
    // Publier une annonce fait passer un voyageur (GUEST) au rôle HOST.
    const listing = await prisma.$transaction(async (tx) => {
      const created = await tx.listing.create({
        data: {
          ...fields,
          pricePerNight: new Prisma.Decimal(pricePerNight),
          acceptsPets: acceptsPets ?? false,
          imageUrl: imageUrl ?? null,
          hostId: req.user.id,
          // imageUrl (compatibilité) : première photo de l'annonce.
          ...(imageUrl ? { images: { create: [{ url: imageUrl, position: 0, alt: fields.title.slice(0, 200) }] } } : {}),
        },
      });
      await tx.user.updateMany({ where: { id: req.user.id, role: "GUEST" }, data: { role: "HOST" } });
      return tx.listing.findUnique({ where: { id: created.id }, include: listingBaseInclude });
    });
    res.status(201).json(listingToJson(listing));
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const existing = await prisma.listing.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Annonce introuvable" });
    if (existing.hostId !== req.user.id) {
      return res.status(403).json({ error: "Non autorisé à modifier cette annonce" });
    }
    // imageUrl n'est plus écrit directement : il reflète la première photo. Une URL fournie
    // devient la photo de couverture ; null est ignoré (supprimer les photos via DELETE images).
    const { imageUrl, ...data } = req.body;
    if (data.pricePerNight !== undefined) data.pricePerNight = new Prisma.Decimal(data.pricePerNight);
    const listing = await prisma.$transaction(async (tx) => {
      await tx.listing.update({ where: { id: req.params.id }, data });
      if (imageUrl) await setExternalCover(tx, req.params.id, imageUrl, data.title ?? existing.title);
      else await syncCoverImage(tx, req.params.id);
      return tx.listing.findUnique({ where: { id: req.params.id }, include: listingBaseInclude });
    });
    res.json(listingToJson(listing));
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const existing = await prisma.listing.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Annonce introuvable" });
    if (existing.hostId !== req.user.id) {
      return res.status(403).json({ error: "Non autorisé à supprimer cette annonce" });
    }
    const paths = await storagePathsOf(existing.id);
    await prisma.listing.delete({ where: { id: req.params.id } });
    // Après suppression en base : fichiers des photos téléversées (la cascade ne touche que la base).
    await removeFromStorage(paths, req.log);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
