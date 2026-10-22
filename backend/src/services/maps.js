// Géocodage (proxy Nominatim) et annonces dans une zone de carte.
// Les erreurs réseau d'axios remontent telles quelles (le contrôleur les traduit en 502).
import axios from "axios";
import prisma from "../config/db.js";
import { buildListingWhere, findListingIdsByText, listingOrderBy, searchText } from "../api/listings/listings.query.js";

const nominatim = axios.create({
  baseURL: "https://nominatim.openstreetmap.org",
  timeout: 5000,
  maxRedirects: 0,
  headers: { "User-Agent": "AfrikaBnB-API/1.0 (geocoding backend)" },
});

export async function geocode({ address, limit }) {
  const response = await nominatim.get("/search", {
    params: { q: address, format: "json", limit },
  });
  return (Array.isArray(response.data) ? response.data : []).map((r) => ({
    displayName: r.display_name,
    latitude: parseFloat(r.lat),
    longitude: parseFloat(r.lon),
    type: r.type,
    importance: r.importance,
  }));
}

export async function reverseGeocode({ lat, lon }) {
  const response = await nominatim.get("/reverse", {
    params: { lat, lon, format: "json" },
  });
  const data = response.data;
  return {
    displayName: data?.display_name,
    latitude: data?.lat ? parseFloat(data.lat) : null,
    longitude: data?.lon ? parseFloat(data.lon) : null,
    address: data?.address,
  };
}

// Annonces publiques dans le rectangle (neLat, neLng, swLat, swLng), mêmes filtres que la recherche.
export async function listingsInBounds(query, db = prisma) {
  const { neLat, neLng, swLat, swLng } = query;
  const text = searchText(query);
  const textMatchIds = text ? await findListingIdsByText(db, text) : undefined;
  const listings = await db.listing.findMany({
    where: {
      ...buildListingWhere(query, { textMatchIds }),
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
      amenities: true,
      instantBook: true,
    },
    orderBy: listingOrderBy(query.sort),
    take: 200,
  });
  return listings.map((l) => ({
    ...l,
    pricePerNight: l.pricePerNight != null ? Number(l.pricePerNight) : null,
    rating: l.rating != null ? Number(l.rating) : null,
  }));
}
