import { api, normalizeListing, buildListingsQuery, isApiUnreachable } from "./client";

const jsonResponse = (body, { status = 200, statusText = "OK" } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText,
  json: () => Promise.resolve(body),
});

beforeEach(() => {
  localStorage.clear();
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
