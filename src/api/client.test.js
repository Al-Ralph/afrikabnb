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
