import axios from "axios";
import prisma from "../../config/db.js";
import { buildListingWhere } from "../listings/listings.query.js";

const nominatim = axios.create({
  baseURL: "https://nominatim.openstreetmap.org",
  timeout: 5000,
  maxRedirects: 0,
  headers: { "User-Agent": "AfrikaBnB-API/1.0 (geocoding backend)" },
});

function upstreamError(err, res, next) {
  if (axios.isAxiosError(err)) {
    console.error(`[maps] Nominatim indisponible : ${err.code || err.response?.status || err.message}`);
    return res.status(502).json({ error: "Service de géocodage indisponible" });
  }
  next(err);
}

export async function geocode(req, res, next) {
  try {
    const { address, limit } = req.query;
    const response = await nominatim.get("/search", {
      params: { q: address, format: "json", limit },
    });
    const results = (Array.isArray(response.data) ? response.data : []).map((r) => ({
      displayName: r.display_name,
      latitude: parseFloat(r.lat),
      longitude: parseFloat(r.lon),
      type: r.type,
      importance: r.importance,
    }));
    res.json({ results });
  } catch (err) {
    upstreamError(err, res, next);
  }
}

export async function reverseGeocode(req, res, next) {
  try {
    const { lat, lon } = req.query;
    const response = await nominatim.get("/reverse", {
      params: { lat, lon, format: "json" },
    });
    const data = response.data;
    res.json({
      displayName: data?.display_name,
      latitude: data?.lat ? parseFloat(data.lat) : null,
      longitude: data?.lon ? parseFloat(data.lon) : null,
      address: data?.address,
    });
  } catch (err) {
    upstreamError(err, res, next);
  }
}

export async function listingsInBounds(req, res, next) {
  try {
    const { neLat, neLng, swLat, swLng } = req.query;
    const listings = await prisma.listing.findMany({
      where: {
        ...buildListingWhere(req.query),
        latitude: { gte: Math.min(neLat, swLat), lte: Math.max(neLat, swLat) },
        longitude: { gte: Math.min(neLng, swLng), lte: Math.max(neLng, swLng) },
      },
      select: {
        id: true,
        title: true,
        location: true,
        latitude: true,
        longitude: true,
        pricePerNight: true,
        currency: true,
        rating: true,
        reviewCount: true,
        imageUrl: true,
        categoryId: true,
        maxGuests: true,
      },
      take: 200,
    });
    const data = listings.map((l) => ({
      ...l,
      pricePerNight: l.pricePerNight != null ? Number(l.pricePerNight) : null,
      rating: l.rating != null ? Number(l.rating) : null,
    }));
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
