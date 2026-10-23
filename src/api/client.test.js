import {
  api,
  normalizeListing,
  buildListingsQuery,
  isApiUnreachable,
  setAccessToken,
  getAccessToken,
  refreshSession,
  SESSION_EXPIRED_EVENT,
} from "./client";
import { SESSION_EXPIRED_EVENT as AUTH_CONTEXT_EVENT } from "../context/AuthContext";

const jsonResponse = (body, { status = 200, statusText = "OK", headers = {} } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText,
  headers: new Headers(headers),
  json: () => Promise.resolve(body),
});
// 401 de authenticateToken (jeton d'accès expiré / révoqué).
const tokenRejected = () =>
  jsonResponse(
    { error: "Token expiré" },
    { status: 401, statusText: "Unauthorized", headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' } }
  );

beforeEach(() => {
  localStorage.clear();
  setAccessToken(null);
  global.fetch = vi.fn();
});

afterEach(() => {
  delete global.fetch;
});

describe("normalizeListing", () => {
  test("maps API fields (pricePerNight, imageUrl) to UI fields (price, image)", () => {
    const out = normalizeListing({ id: "a", title: "T", location: "L", pricePerNight: "120.5", rating: "4.7", imageUrl: "u.jpg" });
    expect(out).toMatchObject({ id: "a", title: "T", location: "L", price: 120.5, rating: 4.7, image: "u.jpg" });
  });

  test("keeps already-normalised items (mocks) unchanged", () => {
    const item = { id: "1", price: 450, rating: 4.9, image: "x.jpg" };
    expect(normalizeListing(item)).toMatchObject(item);
  });

  test("keeps a null rating null and extra fields such as description", () => {
    const out = normalizeListing({ id: "b", pricePerNight: 0, rating: null, description: "d" });
    expect(out.price).toBe(0);
    expect(out.rating).toBeNull();
    expect(out.description).toBe("d");
  });
});

describe("buildListingsQuery", () => {
  test("omits empty parameters", () => {
    expect(buildListingsQuery({ where: "  ", categoryId: null, pets: false, guests: 0 })).toBe("");
    expect(buildListingsQuery()).toBe("");
  });

  test("serialises where, categoryId, pets and guests", () => {
    const q = new URLSearchParams(buildListingsQuery({ where: " Lomé ", categoryId: "safari", pets: true, guests: 3 }));
    expect(q.get("where")).toBe("Lomé");
    expect(q.get("categoryId")).toBe("safari");
    expect(q.get("pets")).toBe("1");
    expect(q.get("guests")).toBe("3");
  });
});

describe("api client", () => {
  test("getListings calls /api/listings with the search params and normalises the data", async () => {
    global.fetch.mockResolvedValue(jsonResponse({ data: [{ id: "1", pricePerNight: 80, imageUrl: "i.jpg" }], total: 1 }));
    const res = await api.getListings({ where: "Accra", pets: true, guests: 2 });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/listings?where=Accra&pets=1&guests=2");
    expect(options.headers["Content-Type"]).toBeUndefined();
    expect(res).toEqual({ data: [expect.objectContaining({ id: "1", price: 80, image: "i.jpg" })], total: 1 });
  });

  test("getListing normalises the listing", async () => {
    global.fetch.mockResolvedValue(jsonResponse({ id: "7", pricePerNight: "55", imageUrl: "p.jpg" }));
    const listing = await api.getListing("7");
    expect(global.fetch.mock.calls[0][0]).toBe("/api/listings/7");
    expect(listing).toMatchObject({ id: "7", price: 55, image: "p.jpg" });
  });

  test("sends Content-Type: application/json only when there is a body", async () => {
    global.fetch.mockResolvedValue(jsonResponse({ user: {}, token: "t" }));
    await api.login("a@b.c", "pw");
    expect(global.fetch.mock.calls[0][1].headers["Content-Type"]).toBe("application/json");
  });

  test("attaches the HTTP status to errors", async () => {
    global.fetch.mockResolvedValue(jsonResponse({ error: "Token invalide" }, { status: 401, statusText: "Unauthorized" }));
    await expect(api.getMe()).rejects.toMatchObject({ message: "Token invalide", status: 401 });
  });

  test("flags network failures as unreachable", async () => {
    global.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await api.getListings().catch((e) => e);
    expect(err.network).toBe(true);
    expect(isApiUnreachable(err)).toBe(true);
  });
});

describe("gateway errors (API waking up behind the Vercel rewrite)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("retries a GET after 502/504, then returns the API response", async () => {
    vi.useFakeTimers();
    global.fetch
      .mockResolvedValueOnce(jsonResponse({}, { status: 502, statusText: "Bad Gateway" }))
      .mockResolvedValueOnce(jsonResponse({}, { status: 504, statusText: "Gateway Timeout" }))
      .mockResolvedValueOnce(jsonResponse({ data: [], total: 0 }));
    const pending = api.getListings();
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ data: [] });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test("gives up after the last retry with the gateway status", async () => {
    vi.useFakeTimers();
    global.fetch.mockResolvedValue(jsonResponse({}, { status: 503, statusText: "Service Unavailable" }));
    const pending = api.getListings().catch((e) => e);
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ status: 503 });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test("never replays a non-GET request", async () => {
    global.fetch.mockResolvedValue(jsonResponse({}, { status: 502, statusText: "Bad Gateway" }));
    await expect(api.login("a@b.c", "x")).rejects.toMatchObject({ status: 502 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("isApiUnreachable", () => {
  test("true for network errors and 5xx, false for 4xx", () => {
    expect(isApiUnreachable({ network: true })).toBe(true);
    expect(isApiUnreachable({ status: 503 })).toBe(true);
    expect(isApiUnreachable({ status: 404 })).toBe(false);
    expect(isApiUnreachable({ status: 400 })).toBe(false);
    expect(isApiUnreachable(null)).toBe(false);
  });
});

describe("vague 3 : filtres, photos, réservations sur demande, admin", () => {
  test("buildListingsQuery serialises prices, amenities and sort (recommended omitted)", () => {
    const q = new URLSearchParams(
      buildListingsQuery({ minPrice: 0, maxPrice: "50000", amenities: ["WIFI", "POOL"], sort: "price_asc" })
    );
    expect(q.get("minPrice")).toBe("0");
    expect(q.get("maxPrice")).toBe("50000");
    expect(q.get("amenities")).toBe("WIFI,POOL");
    expect(q.get("sort")).toBe("price_asc");
    expect(buildListingsQuery({ minPrice: "", amenities: [], sort: "recommended" })).toBe("");
  });

  test("normalizeListing exposes images, amenities and instantBook with fallbacks", () => {
    const withImages = normalizeListing({ id: "a", images: [{ id: "i1", url: "u", alt: null, position: 0 }] });
    expect(withImages.images).toHaveLength(1);
    const legacy = normalizeListing({ id: "b", title: "T", imageUrl: "c.jpg" });
    expect(legacy.images).toEqual([{ id: null, url: "c.jpg", alt: "T", position: 0 }]);
    expect(legacy.amenities).toEqual([]);
    expect(legacy.instantBook).toBe(true);
    expect(normalizeListing({ id: "c", instantBook: false }).instantBook).toBe(false);
  });

  test("getListings returns the global priceRange", async () => {
    global.fetch.mockResolvedValue(jsonResponse({ data: [], total: 0, priceRange: { min: 10, max: 90 } }));
    const res = await api.getListings({ amenities: ["WIFI"] });
    expect(global.fetch.mock.calls[0][0]).toBe("/api/listings?amenities=WIFI");
    expect(res.priceRange).toEqual({ min: 10, max: 90 });
  });

  test("uploadListingImages sends FormData without a JSON Content-Type", async () => {
    global.fetch.mockResolvedValue(jsonResponse({ data: [{ id: "i1", url: "u", alt: null, position: 0 }] }, { status: 201 }));
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const images = await api.uploadListingImages("l 1", [file]);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/listings/l%201/images");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.getAll("images")).toHaveLength(1);
    expect(options.headers["Content-Type"]).toBeUndefined();
    expect(images).toHaveLength(1);
  });

  test("reorderListingImages, confirm/decline and blocked periods hit the right routes", async () => {
    global.fetch.mockResolvedValue(jsonResponse({ data: [] }));
    await api.reorderListingImages("l1", ["b", "a"]);
    expect(global.fetch.mock.calls[0][0]).toBe("/api/listings/l1/images/order");
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ imageIds: ["b", "a"] });

    global.fetch.mockResolvedValue(jsonResponse({ id: "b1", totalPrice: "100", status: "CONFIRMED" }));
    const booking = await api.confirmBooking("b1");
    expect(global.fetch.mock.calls[1][0]).toBe("/api/bookings/b1/confirm");
    expect(global.fetch.mock.calls[1][1].method).toBe("PATCH");
    expect(booking.totalPrice).toBe(100);
    await api.declineBooking("b1");
    expect(global.fetch.mock.calls[2][0]).toBe("/api/bookings/b1/decline");

    global.fetch.mockResolvedValue(jsonResponse({ id: "p1" }, { status: 201 }));
    await api.createBlockedPeriod("l1", { startDate: "2026-12-01", endDate: "2026-12-05", reason: "Travaux" });
    expect(global.fetch.mock.calls[3][0]).toBe("/api/listings/l1/blocked-periods");
    expect(JSON.parse(global.fetch.mock.calls[3][1].body)).toEqual({
      startDate: "2026-12-01",
      endDate: "2026-12-05",
      reason: "Travaux",
    });
  });

  test("forgot / reset password and admin calls", async () => {
    global.fetch.mockResolvedValue(jsonResponse({ message: "ok" }));
    await api.forgotPassword("a@b.co");
    expect(global.fetch.mock.calls[0][0]).toBe("/api/auth/forgot-password");
    await api.resetPassword("tok", "nouveau-mdp");
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ token: "tok", newPassword: "nouveau-mdp" });

    global.fetch.mockResolvedValue(jsonResponse({ data: [], total: 0 }));
    await api.getAdminUsers({ q: " awa ", limit: 20, offset: 0 });
    expect(global.fetch.mock.calls[2][0]).toBe("/api/admin/users?q=awa&limit=20&offset=0");
    await api.updateUserRole("u1", "HOST");
    expect(global.fetch.mock.calls[3][0]).toBe("/api/admin/users/u1/role");
    expect(JSON.parse(global.fetch.mock.calls[3][1].body)).toEqual({ role: "HOST" });

    global.fetch.mockResolvedValue(jsonResponse({ error: "Accès réservé" }, { status: 403, statusText: "Forbidden" }));
    await expect(api.getAdminStats()).rejects.toMatchObject({ status: 403 });
  });
});

describe("updateProfile", () => {
  test("keeps the fresh access token returned after a password change in memory only", async () => {
    setAccessToken("ancien");
    global.fetch.mockResolvedValue(jsonResponse({ id: "u1", name: "Kofi", token: "nouveau" }));
    const user = await api.updateProfile({ currentPassword: "a", newPassword: "b" });
    expect(getAccessToken()).toBe("nouveau");
    expect(user).toEqual({ id: "u1", name: "Kofi" });
    // Cookie de session renouvelé par la réponse : requête avec credentials.
    expect(global.fetch.mock.calls[0][1].credentials).toBe("include");
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer ancien");
    expect(localStorage.getItem("afrikabnb_token")).toBeNull();
  });

  test("keeps the current token when the response carries none", async () => {
    setAccessToken("actuel");
    global.fetch.mockResolvedValue(jsonResponse({ id: "u1", name: "Kofi" }));
    await api.updateProfile({ name: "Kofi" });
    expect(getAccessToken()).toBe("actuel");
  });

  test("a 401 without invalid_token (wrong current password) is not retried", async () => {
    setAccessToken("actuel");
    global.fetch.mockResolvedValue(jsonResponse({ error: "Mot de passe actuel incorrect" }, { status: 401 }));
    await expect(api.updateProfile({ currentPassword: "x", newPassword: "nouveau-mdp" })).rejects.toMatchObject({
      status: 401,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBe("actuel");
  });
});

describe("sessions (access token in memory, refresh cookie)", () => {
  test("the legacy localStorage token is purged when the client loads and never written again", async () => {
    localStorage.setItem("afrikabnb_token", "ancien-jwt");
    vi.resetModules();
    const fresh = await import("./client");
    expect(localStorage.getItem("afrikabnb_token")).toBeNull();
    global.fetch.mockResolvedValue(jsonResponse({ user: { id: "u1" }, token: "acc" }));
    await fresh.api.login("a@b.c", "pw");
    expect(fresh.getAccessToken()).toBe("acc");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  test("login / register keep the access token in memory and send it as a Bearer header", async () => {
    global.fetch.mockResolvedValue(jsonResponse({ user: { id: "u1" }, token: "acc-1" }));
    await api.login("a@b.c", "pw");
    const [, loginInit] = global.fetch.mock.calls[0];
    expect(loginInit.credentials).toBe("include");
    expect(loginInit.headers["X-Requested-With"]).toBe("afrikabnb");
    expect(loginInit.headers.Authorization).toBeUndefined();
    expect(getAccessToken()).toBe("acc-1");

    global.fetch.mockResolvedValue(jsonResponse({ data: [] }));
    await api.getMyBookings();
    const [, init] = global.fetch.mock.calls[1];
    expect(init.headers.Authorization).toBe("Bearer acc-1");
    // Hors /api/auth : ni cookie inter-origine ni en-tête applicatif.
    expect(init.credentials).toBeUndefined();

    global.fetch.mockResolvedValue(jsonResponse({ user: { id: "u2" }, token: "acc-2" }, { status: 201 }));
    await api.register("b@b.c", "pw-long-1", "B");
    expect(getAccessToken()).toBe("acc-2");
  });

  test("refreshSession: POST /api/auth/refresh with credentials and X-Requested-With, stores the token", async () => {
    global.fetch.mockResolvedValue(jsonResponse({ token: "acc", user: { id: "u1" } }));
    const data = await refreshSession();
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/auth/refresh");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers["X-Requested-With"]).toBe("afrikabnb");
    expect(data.user).toEqual({ id: "u1" });
    expect(getAccessToken()).toBe("acc");
  });

  test("refreshSession failure clears the in-memory token and rejects with the status", async () => {
    setAccessToken("old");
    global.fetch.mockResolvedValue(jsonResponse({ error: "Session absente" }, { status: 401 }));
    await expect(refreshSession()).rejects.toMatchObject({ status: 401 });
    expect(getAccessToken()).toBeNull();
  });

  test("401 invalid_token: one refresh, then the request is replayed once with the new token", async () => {
    setAccessToken("expired");
    global.fetch
      .mockResolvedValueOnce(tokenRejected())
      .mockResolvedValueOnce(jsonResponse({ token: "fresh", user: { id: "u1" } }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "b1", totalPrice: "10" }] }));
    const bookings = await api.getMyBookings();
    expect(bookings).toHaveLength(1);
    const urls = global.fetch.mock.calls.map(([u]) => u);
    expect(urls).toEqual(["/api/users/me/bookings", "/api/auth/refresh", "/api/users/me/bookings"]);
    expect(global.fetch.mock.calls[2][1].headers.Authorization).toBe("Bearer fresh");
    expect(getAccessToken()).toBe("fresh");
  });

  test("concurrent 401s share a single refresh call", async () => {
    setAccessToken("expired");
    let releaseRefresh;
    global.fetch.mockImplementation((url, init) => {
      if (url === "/api/auth/refresh") {
        return new Promise((r) => {
          releaseRefresh = () => r(jsonResponse({ token: "fresh", user: { id: "u1" } }));
        });
      }
      return Promise.resolve(
        init.headers.Authorization === "Bearer fresh" ? jsonResponse({ data: [] }) : tokenRejected()
      );
    });
    const all = Promise.all([api.getMyBookings(), api.getFavorites(), api.getMyListings()]);
    await vi.waitFor(() => expect(releaseRefresh).toBeTypeOf("function"));
    releaseRefresh();
    await all;
    const refreshCalls = global.fetch.mock.calls.filter(([u]) => u === "/api/auth/refresh");
    expect(refreshCalls).toHaveLength(1);
    // 3 requêtes refusées + 1 refresh + 3 rejeux.
    expect(global.fetch).toHaveBeenCalledTimes(7);
  });

  test("the replay happens only once: a second 401 is returned to the caller", async () => {
    setAccessToken("expired");
    global.fetch
      .mockResolvedValueOnce(tokenRejected())
      .mockResolvedValueOnce(jsonResponse({ token: "fresh", user: { id: "u1" } }))
      .mockResolvedValueOnce(tokenRejected());
    await expect(api.getMyBookings()).rejects.toMatchObject({ status: 401 });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  test("refresh refused: session-expired event, token forgotten, original error rethrown", async () => {
    setAccessToken("expired");
    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    global.fetch
      .mockResolvedValueOnce(tokenRejected())
      .mockResolvedValueOnce(jsonResponse({ error: "Session révoquée" }, { status: 401 }));
    await expect(api.getFavorites()).rejects.toMatchObject({ status: 401, message: "Token expiré" });
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    // Même nom d'événement que celui écouté par AuthProvider.
    expect(SESSION_EXPIRED_EVENT).toBe(AUTH_CONTEXT_EVENT);
  });

  test("a network failure during refresh does not log the user out", async () => {
    setAccessToken("expired");
    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    global.fetch.mockResolvedValueOnce(tokenRejected()).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api.getFavorites()).rejects.toMatchObject({ status: 401 });
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    expect(onExpired).not.toHaveBeenCalled();
  });

  test("no token: a 401 is returned as is, without any refresh attempt", async () => {
    global.fetch.mockResolvedValue(tokenRejected());
    await expect(api.getFavorites()).rejects.toMatchObject({ status: 401 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("logout forgets the token and calls POST /api/auth/logout with the app header", async () => {
    setAccessToken("acc");
    global.fetch.mockResolvedValue({
      ok: true,
      status: 204,
      statusText: "No Content",
      headers: new Headers(),
      json: () => Promise.reject(new Error("vide")),
    });
    await api.logout();
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/auth/logout");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers["X-Requested-With"]).toBe("afrikabnb");
    expect(init.headers.Authorization).toBeUndefined();
    expect(getAccessToken()).toBeNull();
  });

  test("logoutAll is authenticated and forgets the token on success only", async () => {
    setAccessToken("acc");
    global.fetch.mockResolvedValueOnce(jsonResponse({ error: "Erreur serveur" }, { status: 500 }));
    await expect(api.logoutAll()).rejects.toMatchObject({ status: 500 });
    expect(getAccessToken()).toBe("acc");
    global.fetch.mockResolvedValueOnce(jsonResponse({}, { status: 204 }));
    await api.logoutAll();
    const [url, init] = global.fetch.mock.calls[1];
    expect(url).toBe("/api/auth/logout-all");
    expect(init.headers.Authorization).toBe("Bearer acc");
    expect(getAccessToken()).toBeNull();
  });
});
