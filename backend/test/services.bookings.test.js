import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "secret-de-test-suffisamment-long-pour-hs256-0123456789";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.DIRECT_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.NODE_ENV = "test";
process.env.STORAGE_DRIVER = "local";
process.env.EMAIL_DRIVER = "console";

const { createBooking, confirmBooking, declineBooking, cancelBooking, getAvailability } = await import(
  "../src/services/bookings.js"
);
const { addDays, parseDay, todayDay } = await import("../src/utils/booking.js");

const day = (n) => addDays(todayDay(), n);
const guest = { id: "guest", role: "GUEST" };
const host = { id: "host", role: "HOST" };

// Rejet attendu avec un code HTTP et un message exacts.
async function rejects(promise, statusCode, message) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.statusCode, statusCode);
    if (message) assert.equal(err.message, message);
    return true;
  });
}

// Client Prisma factice pour createBooking : ligne Listing verrouillée, quota, chevauchements.
function createDb({ listing, pendingCount = 0, bookings = [], blockedPeriods = [] } = {}) {
  const calls = { queries: [], created: null, countWhere: null };
  const tx = {
    $queryRaw: async (strings) => {
      const sql = strings.join("?");
      calls.queries.push(sql);
      return sql.includes('FROM "Listing"') ? (listing ? [listing] : []) : [{ id: guest.id }];
    },
    booking: {
      count: async ({ where }) => ((calls.countWhere = where), pendingCount),
      findMany: async () => bookings,
      create: async ({ data }) => ((calls.created = data), { id: "b-new", ...data }),
    },
    blockedPeriod: { findMany: async () => blockedPeriods },
  };
  return { db: { $transaction: async (fn) => fn(tx) }, calls };
}

const activeListing = (over = {}) => ({
  id: "l1",
  hostId: "host",
  pricePerNight: "100.00",
  maxGuests: 4,
  instantBook: true,
  status: "ACTIVE",
  ...over,
});

const stay = (checkIn, checkOut, guests = 2) => ({ listingId: "l1", user: guest, checkIn, checkOut, guests });

test("createBooking : réservation instantanée -> CONFIRMED, prix total, verrou FOR UPDATE de l'annonce", async () => {
  const { db, calls } = createDb({ listing: activeListing() });
  const booking = await createBooking(stay(day(10), day(13)), db);
  assert.equal(booking.status, "CONFIRMED");
  assert.equal(calls.created.guestId, "guest");
  assert.equal(Number(calls.created.totalPrice), 300);
  assert.deepEqual(calls.created.checkIn, parseDay(day(10)));
  assert.match(calls.queries[0], /FROM "Listing" WHERE "id" = \? FOR UPDATE/);
  // Pas de verrou voyageur ni de quota pour une réservation instantanée.
  assert.equal(calls.queries.length, 1);
  assert.equal(calls.countWhere, null);
});

test("createBooking : annonce sans instantBook -> demande PENDING (voyageur verrouillé, quota contrôlé)", async () => {
  const { db, calls } = createDb({ listing: activeListing({ instantBook: false }), pendingCount: 2 });
  const booking = await createBooking(stay(day(10), day(12)), db);
  assert.equal(booking.status, "PENDING");
  assert.match(calls.queries[1], /FROM "User" WHERE "id" = \? FOR UPDATE/);
  assert.equal(calls.countWhere.guestId, "guest");
  assert.equal(calls.countWhere.status, "PENDING");
});

test("createBooking : quota de 3 demandes PENDING atteint -> 429", async () => {
  const { db, calls } = createDb({ listing: activeListing({ instantBook: false }), pendingCount: 3 });
  await rejects(createBooking(stay(day(10), day(12)), db), 429, "Trop de demandes en attente : attendez la réponse des hôtes");
  assert.equal(calls.created, null);
});

test("createBooking : demande limitée à 60 nuits (61 -> 400), la réservation instantanée n'est pas limitée", async () => {
  const request = createDb({ listing: activeListing({ instantBook: false }) });
  await rejects(
    createBooking(stay(day(1), day(62)), request.db),
    400,
    "Une demande est limitée à 60 nuits (réservation instantanée non disponible pour cette annonce)"
  );
  const okRequest = createDb({ listing: activeListing({ instantBook: false }) });
  assert.equal((await createBooking(stay(day(1), day(61)), okRequest.db)).status, "PENDING");
  const instant = createDb({ listing: activeListing() });
  assert.equal((await createBooking(stay(day(1), day(62)), instant.db)).status, "CONFIRMED");
});

test("createBooking : capacité dépassée -> 400 avec la capacité maximale", async () => {
  const { db } = createDb({ listing: activeListing({ maxGuests: 4 }) });
  await rejects(createBooking(stay(day(10), day(12), 5), db), 400, "Capacité maximale dépassée (4 voyageurs)");
  const exact = createDb({ listing: activeListing({ maxGuests: 4 }) });
  assert.equal((await createBooking(stay(day(10), day(12), 4), exact.db)).guests, 4);
});

test("createBooking : annonce absente ou masquée -> 404, sa propre annonce -> 403", async () => {
  await rejects(createBooking(stay(day(10), day(12)), createDb({ listing: null }).db), 404, "Annonce introuvable");
  await rejects(
    createBooking(stay(day(10), day(12)), createDb({ listing: activeListing({ status: "HIDDEN" }) }).db),
    404,
    "Annonce introuvable"
  );
  const own = createDb({ listing: activeListing({ hostId: "guest" }) });
  await rejects(createBooking(stay(day(10), day(12)), own.db), 403, "Impossible de réserver sa propre annonce");
});

test("createBooking : chevauchement d'une réservation ou d'une période bloquée -> 409", async () => {
  const confirmed = { id: "b1", status: "CONFIRMED", createdAt: new Date(), checkIn: parseDay(day(11)), checkOut: parseDay(day(14)) };
  const withBooking = createDb({ listing: activeListing(), bookings: [confirmed] });
  await rejects(createBooking(stay(day(10), day(12)), withBooking.db), 409, "Ces dates ne sont pas disponibles");
  assert.equal(withBooking.calls.created, null);

  const blocked = { id: "p1", startDate: parseDay(day(5)), endDate: parseDay(day(11)) };
  const withBlocked = createDb({ listing: activeListing(), blockedPeriods: [blocked] });
  await rejects(createBooking(stay(day(10), day(12)), withBlocked.db), 409, "Ces dates ne sont pas disponibles");

  // Départ le jour de l'arrivée : pas de chevauchement.
  const adjacent = createDb({ listing: activeListing(), bookings: [confirmed] });
  assert.equal((await createBooking(stay(day(8), day(11)), adjacent.db)).status, "CONFIRMED");
});

// Client Prisma factice pour les transitions : état de la réservation, mises à jour, requêtes brutes.
function transitionDb({ booking, listing = { hostId: "host", status: "ACTIVE" }, others = [] }) {
  const state = booking ? { ...booking } : null;
  const updates = [];
  const queries = [];
  const bookingApi = {
    // Première lecture (avec l'annonce) puis relectures sous verrou et pour la réponse.
    findUnique: async (args) => (state && args.include?.listing?.select ? { ...state, listing } : state && { ...state }),
    update: async ({ data }) => (updates.push(data), Object.assign(state, data)),
    findMany: async () => others,
  };
  const tx = {
    booking: bookingApi,
    blockedPeriod: { findMany: async () => [] },
    $queryRaw: async (strings) => (queries.push(strings.join("?")), []),
  };
  return { db: { booking: bookingApi, $transaction: async (fn) => fn(tx) }, state, updates, queries };
}

const pending = (over = {}) => ({
  id: "b1",
  listingId: "l1",
  guestId: "guest",
  status: "PENDING",
  createdAt: new Date(),
  checkIn: parseDay(day(10)),
  checkOut: parseDay(day(12)),
  ...over,
});

test("confirmBooking : l'hôte accepte une demande -> CONFIRMED sous verrou de l'annonce", async () => {
  const t = transitionDb({ booking: pending() });
  const outcome = await confirmBooking({ bookingId: "b1", user: host }, t.db);
  assert.equal(outcome.changed, true);
  assert.equal(outcome.by, "host");
  assert.equal(outcome.booking.status, "CONFIRMED");
  assert.deepEqual(t.updates, [{ status: "CONFIRMED" }]);
  assert.match(t.queries[0], /FROM "Listing" WHERE "id" = \? FOR UPDATE/);
});

test("confirmBooking / declineBooking : réservé à l'hôte (403), réservation absente (404)", async () => {
  await rejects(
    confirmBooking({ bookingId: "b1", user: guest }, transitionDb({ booking: pending() }).db),
    403,
    "Seul l'hôte peut répondre à cette demande"
  );
  await rejects(
    declineBooking({ bookingId: "b1", user: { id: "autre" } }, transitionDb({ booking: pending() }).db),
    403,
    "Seul l'hôte peut répondre à cette demande"
  );
  await rejects(confirmBooking({ bookingId: "x", user: host }, transitionDb({ booking: null }).db), 404, "Réservation introuvable");
});

test("confirmBooking : annonce non ACTIVE -> 409 ; le refus reste possible", async () => {
  const hidden = { hostId: "host", status: "HIDDEN" };
  const t = transitionDb({ booking: pending(), listing: hidden });
  await rejects(
    confirmBooking({ bookingId: "b1", user: host }, t.db),
    409,
    "Annonce non active : impossible d'accepter cette demande"
  );
  assert.deepEqual(t.updates, []);
  const d = transitionDb({ booking: pending(), listing: hidden });
  const outcome = await declineBooking({ bookingId: "b1", user: host }, d.db);
  assert.equal(outcome.booking.status, "DECLINED");
});

test("confirmBooking / declineBooking : demande expirée -> 409 et EXPIRED persisté", async () => {
  const old = new Date(Date.now() - 49 * 60 * 60 * 1000);
  for (const action of [confirmBooking, declineBooking]) {
    const t = transitionDb({ booking: pending({ createdAt: old }) });
    await rejects(action({ bookingId: "b1", user: host }, t.db), 409, "Cette demande a expiré");
    assert.deepEqual(t.updates, [{ status: "EXPIRED" }]);
  }
});

test("confirmBooking : seule une demande PENDING peut être acceptée (409)", async () => {
  const t = transitionDb({ booking: pending({ status: "CONFIRMED" }) });
  await rejects(
    confirmBooking({ bookingId: "b1", user: host }, t.db),
    409,
    "Seule une demande en attente peut être acceptée ou refusée"
  );
  assert.deepEqual(t.updates, []);
});

test("confirmBooking : dates prises entre-temps -> 409 (garde-fou de chevauchement)", async () => {
  const other = { id: "b2", status: "CONFIRMED", createdAt: new Date(), checkIn: parseDay(day(11)), checkOut: parseDay(day(13)) };
  const t = transitionDb({ booking: pending(), others: [other] });
  await rejects(confirmBooking({ bookingId: "b1", user: host }, t.db), 409, "Ces dates ne sont plus disponibles");
  assert.deepEqual(t.updates, []);
});

test("cancelBooking : voyageur ou hôte seulement ; déjà annulée -> inchangée, sans écriture", async () => {
  await rejects(
    cancelBooking({ bookingId: "b1", user: { id: "autre" } }, transitionDb({ booking: pending() }).db),
    403,
    "Non autorisé à annuler cette réservation"
  );
  const byGuest = transitionDb({ booking: pending({ status: "CONFIRMED" }) });
  const outcome = await cancelBooking({ bookingId: "b1", user: guest }, byGuest.db);
  assert.equal(outcome.by, "guest");
  assert.equal(outcome.booking.status, "CANCELLED");
  const again = transitionDb({ booking: pending({ status: "CANCELLED" }) });
  const unchanged = await cancelBooking({ bookingId: "b1", user: host }, again.db);
  assert.equal(unchanged.changed, false);
  assert.deepEqual(again.updates, []);
});

test("getAvailability : `to` antérieur à `from` -> 400, annonce masquée -> 404", async () => {
  await rejects(getAvailability({ listingId: "l1", from: day(5), to: day(5) }, {}), 400, "`to` doit être postérieur à `from`");
  const db = { listing: { findUnique: async () => ({ id: "l1", status: "HIDDEN" }) } };
  await rejects(getAvailability({ listingId: "l1" }, db), 404, "Annonce introuvable");
});
