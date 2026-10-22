import * as listingsService from "../../services/listings.js";
import { listHostBookings } from "../../services/bookings.js";
import { listingToJson } from "./listings.serializers.js";
import { bookingToJson } from "../bookings/bookings.serializers.js";

export async function list(req, res, next) {
  try {
    const { limit, offset } = req.query;
    const { listings, total, priceRange } = await listingsService.searchListings(req.query, req.userId);
    res.json({ data: listings.map(listingToJson), total, limit, offset, priceRange });
  } catch (err) {
    next(err);
  }
}

// GET /api/listings/price-range
export async function priceRange(req, res, next) {
  try {
    res.json(await listingsService.priceRangeOf());
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    res.json(listingToJson(await listingsService.getListing(req.params.id, req.userId)));
  } catch (err) {
    next(err);
  }
}

// Annonces de l'utilisateur connecté, avec le nombre de réservations en cours ou à venir.
export async function mine(req, res, next) {
  try {
    const listings = await listingsService.listHostListings(req.user.id);
    res.json({ data: listings.map(listingToJson) });
  } catch (err) {
    next(err);
  }
}

// Réservations reçues sur les annonces de l'utilisateur connecté.
export async function mineBookings(req, res, next) {
  try {
    const bookings = await listHostBookings(req.user.id);
    res.json({ data: bookings.map((b) => bookingToJson(b)) });
  } catch (err) {
    next(err);
  }
}

// GET /api/listings/mine/stats : tableau de bord hôte.
export async function mineStats(req, res, next) {
  try {
    const { upcoming, ...stats } = await listingsService.getHostStats(req.user.id);
    res.json({ ...stats, upcomingArrivals: upcoming.map((b) => bookingToJson(b)) });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const listing = await listingsService.createListing(req.user, req.body);
    res.status(201).json(listingToJson(listing));
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const listing = await listingsService.updateListing(req.params.id, req.user, req.body);
    res.json(listingToJson(listing));
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await listingsService.deleteListing(req.params.id, req.user, req.log);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
