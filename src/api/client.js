// Sans REACT_APP_API_URL : chemins relatifs (même origine). En développement, le proxy
// de package.json redirige vers le backend ; en production, l'API est servie sur la même origine.
const API_BASE = process.env.REACT_APP_API_URL || "";

async function request(path, options = {}) {
  const base = API_BASE.replace(/\/$/, "");
  const url = base ? `${base}${path}` : path;
  const headers = {
    ...(options.body != null ? { "Content-Type": "application/json" } : {}),
    ...options.headers,
  };
  const token = localStorage.getItem("afrikabnb_token");
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (cause) {
    const err = new Error("API injoignable");
    err.network = true;
    err.cause = cause;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    // Erreurs de validation (400) : [{ path, message }].
    if (Array.isArray(data.details)) err.details = data.details;
    throw err;
  }
  return data;
}

// Vrai si le backend est injoignable : erreur réseau, ou 5xx hors production (le proxy de
// développement de CRA répond 500 quand le backend n'est pas démarré). En production, un 5xx
// est une vraie panne serveur et doit être affiché, pas masqué par les données de démo.
export function isApiUnreachable(err) {
  if (!err) return false;
  if (err.network === true) return true;
  return (
    process.env.NODE_ENV !== "production" &&
    typeof err.status === "number" &&
    err.status >= 500
  );
}

// Format API (pricePerNight, imageUrl…) -> format UI (price, image…).
export function normalizeListing(item) {
  if (!item) return item;
  return {
    ...item,
    price: item.pricePerNight != null ? Number(item.pricePerNight) : item.price,
    rating: item.rating != null ? Number(item.rating) : item.rating,
    image: item.imageUrl || item.image,
    maxGuests: item.maxGuests != null ? Number(item.maxGuests) : item.maxGuests,
    bedrooms: item.bedrooms != null ? Number(item.bedrooms) : item.bedrooms,
    currency: item.currency || "XOF",
    reviewCount: Number(item.reviewCount) || 0,
    isFavorite: Boolean(item.isFavorite),
  };
}

// Réservation API -> UI : montant numérique et annonce normalisée.
export function normalizeBooking(item) {
  if (!item) return item;
  return {
    ...item,
    totalPrice: Number(item.totalPrice),
    listing: item.listing ? normalizeListing(item.listing) : item.listing,
  };
}

// Date (jour local) ou chaîne "YYYY-MM-DD" -> "YYYY-MM-DD" ; "" si absente ou invalide.
export function toIsoDay(value) {
  if (typeof value === "string") return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

// Construit la query string des annonces en omettant les paramètres vides.
export function buildListingsQuery({ where, categoryId, pets, guests, checkIn, checkOut } = {}) {
  const params = new URLSearchParams();
  const trimmed = typeof where === "string" ? where.trim() : "";
  if (trimmed) params.set("where", trimmed);
  if (categoryId) params.set("categoryId", categoryId);
  if (Number(pets) > 0) params.set("pets", "1");
  if (Number(guests) > 0) params.set("guests", String(Number(guests)));
  const inDay = toIsoDay(checkIn);
  const outDay = toIsoDay(checkOut);
  if (inDay) params.set("checkIn", inDay);
  if (outDay) params.set("checkOut", outDay);
  return params.toString();
}

// Champs UI éventuels (price, image) -> champs API (pricePerNight, imageUrl).
function toListingPayload(data = {}) {
  const { price, image, ...rest } = data;
  const payload = { ...rest };
  if (price !== undefined && payload.pricePerNight === undefined) payload.pricePerNight = Number(price);
  if (image !== undefined && payload.imageUrl === undefined) payload.imageUrl = image;
  return payload;
}

const jsonBody = (method, body) => ({ method, body: JSON.stringify(body) });
const enc = encodeURIComponent;

function withQuery(path, params) {
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}

export const api = {
  async getListings(params = {}) {
    const q = buildListingsQuery(params);
    const { data, total } = await request(`/api/listings${q ? `?${q}` : ""}`);
    return { data: (data || []).map(normalizeListing), total: total || 0 };
  },

  async getListing(id) {
    return normalizeListing(await request(`/api/listings/${encodeURIComponent(id)}`));
  },

  async login(email, password) {
    return request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  async register(email, password, name) {
    return request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    });
  },

  async getMe() {
    return request("/api/auth/me");
  },

  // Annonces visibles sur la carte, avec les mêmes filtres facultatifs que getListings.
  async getListingsInBounds({ neLat, neLng, swLat, swLng }, filters = {}) {
    const params = new URLSearchParams(buildListingsQuery(filters));
    Object.entries({ neLat, neLng, swLat, swLng }).forEach(([k, v]) => params.set(k, String(v)));
    const { data } = await request(`/api/maps/listings-in-bounds?${params}`);
    return (data || []).map(normalizeListing);
  },

  // Ancienne signature, conservée pour compatibilité.
  async getMapsListingsInBounds(neLat, neLng, swLat, swLng) {
    return api.getListingsInBounds({ neLat, neLng, swLat, swLng });
  },

  async geocode(address, limit = 5) {
    const params = new URLSearchParams({ address, limit });
    const { results } = await request(`/api/maps/geocode?${params}`);
    return results || [];
  },

  // --- Profil ---
  async updateProfile(data) {
    return request("/api/users/me", jsonBody("PATCH", data));
  },

  // --- Favoris ---
  async getFavorites() {
    const { data } = await request("/api/users/me/favorites");
    return (data || []).map(normalizeListing);
  },

  async addFavorite(listingId) {
    return request(`/api/listings/${enc(listingId)}/favorite`, { method: "POST" });
  },

  async removeFavorite(listingId) {
    return request(`/api/listings/${enc(listingId)}/favorite`, { method: "DELETE" });
  },

  // --- Espace hôte ---
  async getMyListings() {
    const { data } = await request("/api/listings/mine");
    return (data || []).map(normalizeListing);
  },

  async createListing(data) {
    return normalizeListing(await request("/api/listings", jsonBody("POST", toListingPayload(data))));
  },

  async updateListing(id, data) {
    return normalizeListing(
      await request(`/api/listings/${enc(id)}`, jsonBody("PATCH", toListingPayload(data)))
    );
  },

  async deleteListing(id) {
    await request(`/api/listings/${enc(id)}`, { method: "DELETE" });
  },

  async getMyHostBookings() {
    const { data } = await request("/api/listings/mine/bookings");
    return (data || []).map(normalizeBooking);
  },

  // --- Réservations ---
  async getMyBookings() {
    const { data } = await request("/api/users/me/bookings");
    return (data || []).map(normalizeBooking);
  },

  async createBooking(listingId, { checkIn, checkOut, guests }) {
    const body = { checkIn: toIsoDay(checkIn), checkOut: toIsoDay(checkOut), guests: Number(guests) };
    return normalizeBooking(
      await request(`/api/listings/${enc(listingId)}/bookings`, jsonBody("POST", body))
    );
  },

  async cancelBooking(bookingId) {
    return normalizeBooking(
      await request(`/api/bookings/${enc(bookingId)}/cancel`, { method: "PATCH" })
    );
  },

  async getAvailability(listingId, { from, to } = {}) {
    const params = new URLSearchParams();
    if (toIsoDay(from)) params.set("from", toIsoDay(from));
    if (toIsoDay(to)) params.set("to", toIsoDay(to));
    return request(withQuery(`/api/listings/${enc(listingId)}/availability`, params));
  },

  // --- Avis ---
  async getReviews(listingId, { limit, offset } = {}) {
    const params = new URLSearchParams();
    if (limit != null) params.set("limit", String(limit));
    if (offset != null) params.set("offset", String(offset));
    const res = await request(withQuery(`/api/listings/${enc(listingId)}/reviews`, params));
    return { ...res, data: res.data || [], total: res.total || 0 };
  },

  async createReview(bookingId, { rating, comment }) {
    return request(
      `/api/bookings/${enc(bookingId)}/review`,
      jsonBody("POST", { rating: Number(rating), comment })
    );
  },
};

export default api;
