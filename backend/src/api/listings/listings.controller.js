import { Prisma } from "@prisma/client";
import prisma from "../../config/db.js";
import { parseDay, todayDay } from "../../utils/booking.js";
import { buildListingWhere, findListingIdsByText, searchText } from "./listings.query.js";
import { hostSelect, listingToJson } from "./listings.serializers.js";
import { bookingToJson, hostBookingInclude } from "../bookings/bookings.controller.js";

// Inclut le statut favori uniquement pour un utilisateur authentifié (optionalAuth).
function listingInclude(userId) {
  const include = { host: hostSelect };
  if (userId) include.favorites = { where: { userId }, select: { id: true } };
  return include;
}

export async function list(req, res, next) {
  try {
    const { limit, offset } = req.query;
    const text = searchText(req.query);
    const textMatchIds = text ? await findListingIdsByText(prisma, text) : undefined;
    const where = buildListingWhere(req.query, { textMatchIds });
    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        include: listingInclude(req.userId),
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.listing.count({ where }),
    ]);
    res.json({ data: listings.map(listingToJson), total, limit, offset });
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
        host: hostSelect,
        _count: {
          select: {
            bookings: {
              where: { status: { not: "CANCELLED" }, checkOut: { gt: parseDay(todayDay()) } },
            },
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
    const bookings = await prisma.booking.findMany({
      where: { listing: { hostId: req.user.id } },
      include: hostBookingInclude,
      orderBy: { checkIn: "desc" },
    });
    res.json({ data: bookings.map(bookingToJson) });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { pricePerNight, acceptsPets, ...fields } = req.body;
    // Publier une annonce fait passer un voyageur (GUEST) au rôle HOST.
    const [listing] = await prisma.$transaction([
      prisma.listing.create({
        data: {
          ...fields,
          pricePerNight: new Prisma.Decimal(pricePerNight),
          acceptsPets: acceptsPets ?? false,
          hostId: req.user.id,
        },
        include: { host: hostSelect },
      }),
      prisma.user.updateMany({
        where: { id: req.user.id, role: "GUEST" },
        data: { role: "HOST" },
      }),
    ]);
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
    const data = { ...req.body };
    if (data.pricePerNight !== undefined) data.pricePerNight = new Prisma.Decimal(data.pricePerNight);
    const listing = await prisma.listing.update({
      where: { id: req.params.id },
      data,
      include: { host: hostSelect },
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
    await prisma.listing.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
