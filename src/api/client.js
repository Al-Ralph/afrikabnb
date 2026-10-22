// Sans VITE_API_URL : chemins relatifs (même origine). En développement, le proxy
// de vite.config.js redirige vers le backend ; en production, l'API est servie sur la même origine.
const API_BASE = import.meta.env.VITE_API_URL || "";

// Sessions : le jeton d'accès (JWT court) n'existe qu'en mémoire, jamais dans localStorage /
// sessionStorage ; le jeton de renouvellement est un cookie httpOnly (afrikabnb_rt, Path=/api/auth)
// illisible par le JavaScript. Migration : l'ancien JWT stocké est supprimé au chargement.
const LEGACY_TOKEN_KEY = "afrikabnb_token";
try {
  globalThis.localStorage?.removeItem(LEGACY_TOKEN_KEY);
} catch {
  // Stockage indisponible (navigation privée stricte) : rien à purger.
}

// Émis sur window quand la session ne peut plus être renouvelée (écouté par AuthProvider).
export const SESSION_EXPIRED_EVENT = "afrikabnb:session-expired";
// En-tête exigé par /api/auth/refresh et /api/auth/logout (défense CSRF).
const APP_HEADER = { "X-Requested-With": "afrikabnb" };

let accessToken = null;

export function setAccessToken(token) {
  accessToken = token || null;
}

export function getAccessToken() {
  return accessToken;
}

async function send(path, options, token) {
  const base = API_BASE.replace(/\/$/, "");
  const url = base ? `${base}${path}` : path;
  // FormData (téléversement) : le navigateur fixe lui-même multipart/form-data et sa frontière.
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = {
    ...(options.body != null && !isForm ? { "Content-Type": "application/json" } : {}),
    ...options.headers,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { ...options, headers };
  // Routes qui lisent ou posent le cookie de session : cookie envoyé / accepté même si l'API est
  // sur une autre origine (VITE_API_URL), avec l'en-tête applicatif.
  if (path.startsWith("/api/auth/") || options.credentials === "include") {
    init.credentials = "include";
    Object.assign(headers, APP_HEADER);
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch (cause) {
    const err = new Error("API injoignable");
    err.network = true;
    err.cause = cause;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function httpError(res, data) {
  const err = new Error(data.error || res.statusText);
  err.status = res.status;
  // Erreurs de validation (400) : [{ path, message }].
  if (Array.isArray(data.details)) err.details = data.details;
  return err;
}

// Verrou inter-onglets (Web Locks) : deux onglets ne présentent jamais le même cookie en même
// temps (sinon la rotation verrait une réutilisation et fermerait la session partout).
function withRefreshLock(fn) {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks?.request ? locks.request("afrikabnb-refresh", fn) : fn();
}

let refreshPromise = null;

// Renouvelle la session à partir du cookie : { token, user }. Mutualisé : les appels simultanés
// partagent la même requête. Rejette (err.status 401) si la session est absente ou révoquée.
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = withRefreshLock(async () => {
      const { res, data } = await send("/api/auth/refresh", { method: "POST" }, null);
      if (!res.ok) {
        accessToken = null;
        throw httpError(res, data);
      }
      accessToken = data.token || null;
      return data;
    }).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function notifySessionExpired() {
  accessToken = null;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

// options.auth === false : jamais d'en-tête Authorization (connexion, inscription…).
async function request(path, { auth = true, ...options } = {}) {
  const token = auth ? accessToken : null;
  let { res, data } = await send(path, options, token);
  // Jeton d'accès expiré ou révoqué (401 + WWW-Authenticate: Bearer error="invalid_token") : un seul
  // renouvellement, puis un seul rejeu. Les autres 401 (mot de passe actuel incorrect…) remontent tels quels.
  if (res.status === 401 && token && /invalid_token/.test(res.headers?.get?.("WWW-Authenticate") || "")) {
    let fresh = accessToken && accessToken !== token ? accessToken : null;
    if (!fresh) {
      try {
        fresh = (await refreshSession()).token;
      } catch (err) {
        // Session refusée par l'API : déconnexion. Panne réseau / serveur : on garde l'état.
        if (err?.status === 401 || err?.status === 403) notifySessionExpired();
        throw httpError(res, data);
      }
    }
    ({ res, data } = await send(path, options, fresh));
  }
  if (!res.ok) throw httpError(res, data);
  return data;
}

// Vrai si le backend est injoignable : erreur réseau, ou 5xx hors production (le proxy de
// développement de Vite répond 500 quand le backend n'est pas démarré). En production, un 5xx
// est une vraie panne serveur et doit être affiché, pas masqué par les données de démo.
export function isApiUnreachable(err) {
  if (!err) return false;
  if (err.network === true) return true;
  return (
    !import.meta.env.PROD &&
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
    // Photos triées ({ id, url, alt, position }) ; repli sur l'image de couverture.
    images: Array.isArray(item.images)
      ? item.images
      : item.imageUrl || item.image
        ? [{ id: null, url: item.imageUrl || item.image, alt: item.title ?? null, position: 0 }]
        : [],
    amenities: Array.isArray(item.amenities) ? item.amenities : [],
    instantBook: item.instantBook !== false,
  };
}

// Équipements reconnus par l'API (enum Amenity) ; libellés à la charge de l'UI.
export const AMENITIES = [
  "WIFI", "AIR_CONDITIONING", "FAN", "POOL", "PARKING", "KITCHEN", "WASHER", "TV", "WORKSPACE",
  "GENERATOR", "SOLAR_POWER", "WATER_TANK", "WATER_HEATER", "SECURITY", "CCTV", "BREAKFAST",
  "SEA_VIEW", "BEACH_ACCESS", "GARDEN", "TERRACE", "BBQ", "MOSQUITO_NETS", "AIRPORT_SHUTTLE",
  "HOUSEKEEPING",
];

// Tris acceptés par GET /api/listings (et listings-in-bounds).
export const LISTING_SORTS = ["recommended", "price_asc", "price_desc", "rating_desc"];

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
export function buildListingsQuery({
  where,
  categoryId,
  pets,
  guests,
  checkIn,
  checkOut,
  minPrice,
  maxPrice,
  amenities,
  sort,
} = {}) {
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
  const isPrice = (v) => v !== "" && v != null && Number.isFinite(Number(v)) && Number(v) >= 0;
  if (isPrice(minPrice)) params.set("minPrice", String(Number(minPrice)));
  if (isPrice(maxPrice)) params.set("maxPrice", String(Number(maxPrice)));
  const codes = (Array.isArray(amenities) ? amenities : typeof amenities === "string" ? amenities.split(",") : [])
    .map((a) => String(a).trim())
    .filter(Boolean);
  if (codes.length) params.set("amenities", codes.join(","));
  if (sort && sort !== "recommended") params.set("sort", sort);
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
    const { data, total, priceRange } = await request(`/api/listings${q ? `?${q}` : ""}`);
    // priceRange : { min, max } global (curseurs de prix), indépendant des filtres.
    return { data: (data || []).map(normalizeListing), total: total || 0, priceRange };
  },

  async getListing(id) {
    return normalizeListing(await request(`/api/listings/${encodeURIComponent(id)}`));
  },

  // { user, token } : le jeton d'accès est gardé en mémoire, le cookie de renouvellement est posé
  // par l'API.
  async login(email, password) {
    const data = await request("/api/auth/login", { ...jsonBody("POST", { email, password }), auth: false });
    setAccessToken(data.token);
    return data;
  },

  async register(email, password, name) {
    const data = await request("/api/auth/register", { ...jsonBody("POST", { email, password, name }), auth: false });
    setAccessToken(data.token);
    return data;
  },

  refreshSession,

  // Déconnexion de cet appareil : jeton oublié, cookie révoqué et effacé par l'API (204).
  async logout() {
    setAccessToken(null);
    await request("/api/auth/logout", { method: "POST", auth: false });
  },

  // Déconnexion de tous les appareils (toutes les sessions de l'utilisateur).
  async logoutAll() {
    await request("/api/auth/logout-all", { method: "POST" });
    setAccessToken(null);
  },

  async getMe() {
    return request("/api/auth/me");
  },

  // --- Mot de passe oublié ---
  // Toujours 200 avec le même message (que le compte existe ou non). 429 si trop de demandes.
  async forgotPassword(email) {
    return request("/api/auth/forgot-password", { ...jsonBody("POST", { email }), auth: false });
  },

  // 400 si le jeton est invalide, expiré ou déjà utilisé.
  async resetPassword(token, newPassword) {
    return request("/api/auth/reset-password", { ...jsonBody("POST", { token, newPassword }), auth: false });
  },

  // { min, max } des prix des annonces publiques (null sans annonce).
  async getPriceRange() {
    return request("/api/listings/price-range");
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
    // credentials : un changement de mot de passe pose un nouveau cookie de session.
    const { token, ...user } = await request("/api/users/me", { ...jsonBody("PATCH", data), credentials: "include" });
    // Changement de mot de passe : les autres sessions sont révoquées, le nouveau jeton garde celle-ci.
    if (token) setAccessToken(token);
    return user;
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

  // Tableau de bord hôte : revenus, nuits, occupation, prochaines arrivées, note moyenne.
  async getHostStats() {
    const stats = await request("/api/listings/mine/stats");
    return { ...stats, upcomingArrivals: (stats.upcomingArrivals || []).map(normalizeBooking) };
  },

  // --- Photos (hôte propriétaire) ---
  // files : File[] / FileList (JPEG, PNG, WebP ; 5 Mo par image, 10 images max par annonce).
  // Retourne toutes les photos de l'annonce, triées.
  async uploadListingImages(listingId, files) {
    const form = new FormData();
    Array.from(files || []).forEach((f) => form.append("images", f));
    const { data } = await request(`/api/listings/${enc(listingId)}/images`, { method: "POST", body: form });
    return data || [];
  },

  async deleteListingImage(listingId, imageId) {
    const { data } = await request(`/api/listings/${enc(listingId)}/images/${enc(imageId)}`, {
      method: "DELETE",
    });
    return data || [];
  },

  // imageIds : tous les identifiants des photos, dans le nouvel ordre (le premier = couverture).
  async reorderListingImages(listingId, imageIds) {
    const { data } = await request(
      `/api/listings/${enc(listingId)}/images/order`,
      jsonBody("PATCH", { imageIds })
    );
    return data || [];
  },

  // --- Dates bloquées (hôte propriétaire) ---
  async getBlockedPeriods(listingId, { from } = {}) {
    const params = new URLSearchParams();
    if (toIsoDay(from)) params.set("from", toIsoDay(from));
    const { data } = await request(withQuery(`/api/listings/${enc(listingId)}/blocked-periods`, params));
    return data || [];
  },

  async createBlockedPeriod(listingId, { startDate, endDate, reason }) {
    const body = { startDate: toIsoDay(startDate), endDate: toIsoDay(endDate) };
    if (reason) body.reason = reason;
    return request(`/api/listings/${enc(listingId)}/blocked-periods`, jsonBody("POST", body));
  },

  async deleteBlockedPeriod(listingId, periodId) {
    await request(`/api/listings/${enc(listingId)}/blocked-periods/${enc(periodId)}`, {
      method: "DELETE",
    });
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

  // Hôte : accepter / refuser une demande PENDING (409 si expirée ou déjà traitée).
  async confirmBooking(bookingId) {
    return normalizeBooking(
      await request(`/api/bookings/${enc(bookingId)}/confirm`, { method: "PATCH" })
    );
  },

  async declineBooking(bookingId) {
    return normalizeBooking(
      await request(`/api/bookings/${enc(bookingId)}/decline`, { method: "PATCH" })
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

  // --- Administration (rôle ADMIN ; 401 / 403 sinon) ---
  async getAdminStats() {
    return request("/api/admin/stats");
  },

  async getAdminUsers({ q, role, limit, offset } = {}) {
    const params = new URLSearchParams();
    if (typeof q === "string" && q.trim()) params.set("q", q.trim());
    if (role) params.set("role", role);
    if (limit != null) params.set("limit", String(limit));
    if (offset != null) params.set("offset", String(offset));
    return request(withQuery("/api/admin/users", params));
  },

  async updateUserRole(userId, role) {
    return request(`/api/admin/users/${enc(userId)}/role`, jsonBody("PATCH", { role }));
  },

  async getAdminListings({ q, status, limit, offset } = {}) {
    const params = new URLSearchParams();
    if (typeof q === "string" && q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (limit != null) params.set("limit", String(limit));
    if (offset != null) params.set("offset", String(offset));
    const res = await request(withQuery("/api/admin/listings", params));
    return { ...res, data: (res.data || []).map(normalizeListing) };
  },

  async updateListingStatus(listingId, status) {
    return normalizeListing(
      await request(`/api/admin/listings/${enc(listingId)}/status`, jsonBody("PATCH", { status }))
    );
  },

  async getAdminReviews({ limit, offset } = {}) {
    const params = new URLSearchParams();
    if (limit != null) params.set("limit", String(limit));
    if (offset != null) params.set("offset", String(offset));
    return request(withQuery("/api/admin/reviews", params));
  },

  // -> { listing: { id, rating, reviewCount } } (note recalculée)
  async deleteReview(reviewId) {
    return request(`/api/admin/reviews/${enc(reviewId)}`, { method: "DELETE" });
  },
};

export default api;
