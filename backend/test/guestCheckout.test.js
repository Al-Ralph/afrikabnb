import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "secret-de-test-suffisamment-long-pour-hs256-0123456789";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.DIRECT_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.NODE_ENV = "test";
process.env.STORAGE_DRIVER = "local";
process.env.EMAIL_DRIVER = "console";

const { createBooking, cancelBooking, cancelGuestBooking, getGuestBooking } = await import(
  "../src/services/bookings.js"
);
const { createBookingSchema, rejectHoneypot } = await import("../src/api/bookings/bookings.schemas.js");
const { bookingToJson, bookingWithContactToJson } = await import("../src/api/bookings/bookings.serializers.js");
const { guestRecipient } = await import("../src/api/bookings/bookings.notifications.js");
const { bookingRequestGuestEmail, bookingRequestHostEmail } = await import("../src/services/email/templates.js");
const { generateGuestAccessToken, hashGuestAccessToken, guestAccessExpiry } = await import(
  "../src/utils/guestAccess.js"
);
const { maskSensitiveUrl } = await import("../src/config/logger.js");
const { addDays, parseDay, todayDay } = await import("../src/utils/booking.js");

const day = (n) => addDays(todayDay(), n);
const host = { id: "host", role: "HOST" };

async function rejects(promise, statusCode, message) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.statusCode, statusCode);
    if (message) assert.equal(err.message, message);
    return true;
  });
}

const contact = {
  name: "Ama Mensah",
  email: "ama@example.com",
  phone: "+228 90 00 00 00",
  country: "TG",
  arrivalTime: "15:30",
  message: "Arrivée en taxi",
};

const body = (over = {}) => ({
  checkIn: day(10),
  checkOut: day(12),
  guests: 2,
  contact,
  acceptTerms: true,
  ...over,
});

// --- Validation du corps -------------------------------------------------------------------

test("schéma : corps complet accepté, e-mail normalisé en minuscules, pays en majuscules", () => {
  const r = createBookingSchema.safeParse(body({ contact: { ...contact, email: "  AMA@Example.COM ", country: "tg" } }));
  assert.equal(r.success, true);
  assert.equal(r.data.contact.email, "ama@example.com");
  assert.equal(r.data.contact.country, "TG");
});

test("schéma : acceptTerms obligatoire (absent ou false -> refusé)", () => {
  const { acceptTerms: _, ...without } = body();
  assert.equal(createBookingSchema.safeParse(without).success, false);
  assert.equal(createBookingSchema.safeParse(body({ acceptTerms: false })).success, false);
});

test("schéma : contact obligatoire et validé (nom, e-mail, téléphone, pays, heure, message)", () => {
  const { contact: _, ...noContact } = body();
  assert.equal(createBookingSchema.safeParse(noContact).success, false);
  const invalid = [
    { name: "A" },
    { name: "Ama‮evil" },
    { email: "pas-un-email" },
    { phone: "12" },
    { phone: "+228 abc 000" },
    { phone: "+1234567890123456" },
    { country: "TGO" },
    { country: "1A" },
    { arrivalTime: "25:00" },
    { arrivalTime: "9h" },
    { message: "x".repeat(1001) },
    { inconnu: "x" },
  ];
  for (const over of invalid) {
    const r = createBookingSchema.safeParse(body({ contact: { ...contact, ...over } }));
    assert.equal(r.success, false, JSON.stringify(over));
  }
  // Champs facultatifs vides -> absents.
  const r = createBookingSchema.safeParse(body({ contact: { ...contact, arrivalTime: "", message: "  " } }));
  assert.equal(r.success, true);
  assert.equal(r.data.contact.arrivalTime, undefined);
  assert.equal(r.data.contact.message, undefined);
});

test("piège `website` : rempli -> 400 générique sans détail, vide -> requête poursuivie", () => {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  let nextCalled = false;
  rejectHoneypot({ body: body({ website: "http://spam" }) }, res, () => (nextCalled = true));
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Requête invalide" });

  rejectHoneypot({ body: body({ website: "" }) }, res, () => (nextCalled = true));
  assert.equal(nextCalled, true);
  // Le schéma refuse aussi un champ piège non vide.
  assert.equal(createBookingSchema.safeParse(body({ website: "x" })).success, false);
  assert.equal(createBookingSchema.safeParse(body({ website: "" })).success, true);
});

// --- Création sans compte -------------------------------------------------------------------

function createDb({ listing, pendingCount = 0, bookings = [] } = {}) {
  const calls = { queries: [], created: null, countWhere: null, lockKeys: [] };
  const tx = {
    $queryRaw: async (strings) => {
      const sql = strings.join("?");
      calls.queries.push(sql);
      return sql.includes('FROM "Listing"') ? (listing ? [listing] : []) : [];
    },
    $executeRaw: async (strings, ...values) => {
      calls.queries.push(strings.join("?"));
      calls.lockKeys.push(...values);
      return 1;
    },
    booking: {
      count: async ({ where }) => ((calls.countWhere = where), pendingCount),
      findMany: async () => bookings,
      create: async ({ data }) => ((calls.created = data), { id: "b-new", createdAt: new Date(), ...data }),
    },
    blockedPeriod: { findMany: async () => [] },
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

const anonymousStay = (checkIn, checkOut, over = {}) => ({
  listingId: "l1",
  user: null,
  checkIn,
  checkOut,
  guests: 2,
  contact,
  ...over,
});

test("sans compte : toujours PENDING même si instantBook, guestId null, fiche de contact enregistrée", async () => {
  const { db, calls } = createDb({ listing: activeListing({ instantBook: true }) });
  const { booking, accessToken } = await createBooking(anonymousStay(day(10), day(13)), db);
  assert.equal(booking.status, "PENDING");
  assert.equal(calls.created.guestId, null);
  assert.equal(calls.created.contactName, "Ama Mensah");
  assert.equal(calls.created.contactEmail, "ama@example.com");
  assert.equal(calls.created.contactPhone, "+228 90 00 00 00");
  assert.equal(calls.created.contactCountry, "TG");
  assert.equal(calls.created.arrivalTime, "15:30");
  assert.equal(calls.created.messageToHost, "Arrivée en taxi");
  assert.equal(Number(calls.created.totalPrice), 300);
  assert.match(accessToken, /^[A-Za-z0-9_-]{43}$/);
});

test("sans compte : jeton d'accès haché (jamais stocké en clair), expiration = départ + 30 jours", async () => {
  const { db, calls } = createDb({ listing: activeListing() });
  const { accessToken } = await createBooking(anonymousStay(day(10), day(13)), db);
  assert.equal(calls.created.guestAccessTokenHash, hashGuestAccessToken(accessToken));
  assert.match(calls.created.guestAccessTokenHash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(calls.created).includes(accessToken), false);
  assert.deepEqual(calls.created.guestAccessExpiresAt, new Date(parseDay(day(13)).getTime() + 30 * 86400000));
});

test("sans compte : verrou consultatif et quota de 3 demandes PENDING par adresse e-mail (429)", async () => {
  const ok = createDb({ listing: activeListing(), pendingCount: 2 });
  await createBooking(anonymousStay(day(10), day(12)), ok.db);
  assert.ok(ok.calls.queries.some((q) => /pg_advisory_xact_lock\(hashtext\(\?\)\)/.test(q)));
  assert.deepEqual(ok.calls.lockKeys, ["booking-contact:ama@example.com"]);
  assert.equal(ok.calls.countWhere.contactEmail, "ama@example.com");
  assert.equal(ok.calls.countWhere.status, "PENDING");
  assert.equal(ok.calls.countWhere.guestId, undefined);
  // Pas de verrou de ligne User pour un voyageur sans compte.
  assert.equal(ok.calls.queries.some((q) => q.includes('FROM "User"')), false);

  const full = createDb({ listing: activeListing(), pendingCount: 3 });
  await rejects(
    createBooking(anonymousStay(day(10), day(12)), full.db),
    429,
    "Trop de demandes en attente : attendez la réponse des hôtes"
  );
  assert.equal(full.calls.created, null);
});

test("sans compte : 60 nuits maximum (61 -> 400), même sur une annonce instantanée", async () => {
  const { db } = createDb({ listing: activeListing({ instantBook: true }) });
  await rejects(createBooking(anonymousStay(day(1), day(62)), db), 400, "Une demande est limitée à 60 nuits");
  const okDb = createDb({ listing: activeListing({ instantBook: true }) });
  assert.equal((await createBooking(anonymousStay(day(1), day(61)), okDb.db)).booking.status, "PENDING");
});

test("connecté : statut inchangé (instantBook -> CONFIRMED), contact enregistré, aucun jeton", async () => {
  const { db, calls } = createDb({ listing: activeListing() });
  const { booking, accessToken } = await createBooking(anonymousStay(day(10), day(12), { user: { id: "guest" } }), db);
  assert.equal(booking.status, "CONFIRMED");
  assert.equal(accessToken, null);
  assert.equal(calls.created.guestId, "guest");
  assert.equal(calls.created.contactEmail, "ama@example.com");
  assert.equal(calls.created.guestAccessTokenHash, null);
});

// --- Suivi / annulation par jeton -----------------------------------------------------------

const futureExpiry = () => new Date(Date.now() + 10 * 86400000);

function tokenDb({ booking, listing = { hostId: "host", status: "ACTIVE" } }) {
  const state = booking ? { ...booking } : null;
  const lookups = [];
  const updates = [];
  const bookingApi = {
    findUnique: async (args) => {
      lookups.push(args.where);
      if (!state) return null;
      if (args.where.guestAccessTokenHash !== undefined) {
        return args.where.guestAccessTokenHash === state.guestAccessTokenHash ? { ...state, listing } : null;
      }
      return args.include?.listing?.select ? { ...state, listing } : { ...state };
    },
    update: async ({ data }) => (updates.push(data), Object.assign(state, data)),
    findMany: async () => [],
  };
  const tx = {
    booking: bookingApi,
    blockedPeriod: { findMany: async () => [] },
    $queryRaw: async () => [],
  };
  return { db: { booking: bookingApi, $transaction: async (fn) => fn(tx) }, lookups, updates, state };
}

const guestBooking = (token, over = {}) => ({
  id: "b1",
  listingId: "l1",
  guestId: null,
  status: "PENDING",
  createdAt: new Date(),
  checkIn: parseDay(day(10)),
  checkOut: parseDay(day(12)),
  guests: 2,
  totalPrice: "200.00",
  contactName: "Ama Mensah",
  contactEmail: "ama@example.com",
  contactPhone: "+228 90 00 00 00",
  contactCountry: "TG",
  arrivalTime: null,
  messageToHost: null,
  guestAccessTokenHash: hashGuestAccessToken(token),
  guestAccessExpiresAt: futureExpiry(),
  ...over,
});

test("getGuestBooking : recherche par empreinte du jeton (jamais le jeton en clair)", async () => {
  const { token } = generateGuestAccessToken(day(12));
  const t = tokenDb({ booking: guestBooking(token) });
  const found = await getGuestBooking({ token }, t.db);
  assert.equal(found.id, "b1");
  assert.deepEqual(t.lookups[0], { guestAccessTokenHash: hashGuestAccessToken(token) });
});

test("getGuestBooking : jeton inconnu, expiré ou mal formé -> 404 générique", async () => {
  const { token } = generateGuestAccessToken(day(12));
  const other = generateGuestAccessToken(day(12)).token;
  await rejects(getGuestBooking({ token: other }, tokenDb({ booking: guestBooking(token) }).db), 404, "Réservation introuvable");
  const expired = tokenDb({ booking: guestBooking(token, { guestAccessExpiresAt: new Date(Date.now() - 1000) }) });
  await rejects(getGuestBooking({ token }, expired.db), 404, "Réservation introuvable");
  const malformed = tokenDb({ booking: guestBooking(token) });
  await rejects(getGuestBooking({ token: "court" }, malformed.db), 404, "Réservation introuvable");
  assert.equal(malformed.lookups.length, 0);
});

test("cancelGuestBooking : annule (by guest), mêmes règles qu'un voyageur connecté", async () => {
  const { token } = generateGuestAccessToken(day(12));
  const t = tokenDb({ booking: guestBooking(token) });
  const outcome = await cancelGuestBooking({ token }, t.db);
  assert.equal(outcome.changed, true);
  assert.equal(outcome.by, "guest");
  assert.deepEqual(t.updates, [{ status: "CANCELLED" }]);

  // Séjour commencé -> 409 ; jeton expiré -> 404 sans écriture.
  const started = tokenDb({ booking: guestBooking(token, { status: "CONFIRMED", checkIn: parseDay(todayDay()) }) });
  await rejects(cancelGuestBooking({ token }, started.db), 409, "Le séjour a déjà commencé");
  const expired = tokenDb({ booking: guestBooking(token, { guestAccessExpiresAt: new Date(Date.now() - 1) }) });
  await rejects(cancelGuestBooking({ token }, expired.db), 404, "Réservation introuvable");
  assert.deepEqual(expired.updates, []);
});

test("réservation sans compte : un autre utilisateur ne peut pas l'annuler, l'hôte oui (by host)", async () => {
  const { token } = generateGuestAccessToken(day(12));
  await rejects(
    cancelBooking({ bookingId: "b1", user: { id: "intrus" } }, tokenDb({ booking: guestBooking(token) }).db),
    403,
    "Non autorisé à annuler cette réservation"
  );
  const outcome = await cancelBooking({ bookingId: "b1", user: host }, tokenDb({ booking: guestBooking(token) }).db);
  assert.equal(outcome.by, "host");
});

test("guestAccessExpiry : départ + 30 jours", () => {
  assert.equal(guestAccessExpiry("2026-11-04").toISOString(), "2026-12-04T00:00:00.000Z");
});

// --- Sérialisation ----------------------------------------------------------------------------

test("sérialisation publique : jamais de fiche de contact ni d'empreinte du jeton", () => {
  const { token } = generateGuestAccessToken(day(12));
  const json = bookingToJson(guestBooking(token, { arrivalTime: "15:30", messageToHost: "Bonjour" }));
  for (const key of [
    "contact",
    "contactName",
    "contactEmail",
    "contactPhone",
    "contactCountry",
    "arrivalTime",
    "messageToHost",
    "guestAccessTokenHash",
    "guestAccessExpiresAt",
  ]) {
    assert.equal(key in json, false, key);
  }
  assert.equal(JSON.stringify(json).includes("ama@example.com"), false);
});

test("sérialisation hôte : fiche de contact complète, guestAccount false, sans empreinte du jeton", () => {
  const { token } = generateGuestAccessToken(day(12));
  const json = bookingWithContactToJson(guestBooking(token, { arrivalTime: "15:30", messageToHost: "Bonjour" }));
  assert.deepEqual(json.contact, {
    name: "Ama Mensah",
    email: "ama@example.com",
    phone: "+228 90 00 00 00",
    country: "TG",
    arrivalTime: "15:30",
    message: "Bonjour",
  });
  assert.equal(json.guestAccount, false);
  assert.equal("guestAccessTokenHash" in json, false);
  // Réservation antérieure sans fiche : contact null.
  const legacy = bookingWithContactToJson({ ...guestBooking(token), guestId: "u1", contactName: null, contactEmail: null });
  assert.equal(legacy.contact, null);
  assert.equal(legacy.guestAccount, true);
});

// --- E-mails ----------------------------------------------------------------------------------

const mailBooking = {
  listingTitle: "Villa",
  checkIn: "2026-11-01",
  checkOut: "2026-11-04",
  nights: 3,
  guests: 2,
  totalPrice: 135000,
  currency: "XOF",
};

test("e-mail hôte : fiche de contact échappée, marquée comme saisie par le voyageur sans compte", () => {
  const evil = `<script>alert(1)</script>`;
  const mail = bookingRequestHostEmail({
    name: "Hôte",
    guestName: evil,
    booking: mailBooking,
    url: "https://app.test/host",
    contact: { ...contact, name: evil, message: `${evil}\nligne 2` },
    guestAccount: false,
  });
  assert.equal(mail.html.includes("<script>"), false);
  assert.match(mail.text, /réservation sans compte AfrikaBnB, non vérifiées/);
  assert.match(mail.text, /E-mail : ama@example\.com/);
  assert.match(mail.text, /Téléphone : \+228 90 00 00 00/);
  assert.match(mail.text, /Pays : Togo/);
  assert.match(mail.text, /Heure d'arrivée estimée : 15:30/);
  assert.equal(mail.subject.includes("\n"), false);
});

test("e-mail voyageur sans compte : lien de suivi personnel, sujet sur une ligne", () => {
  const mail = bookingRequestGuestEmail({
    name: "Ama",
    booking: { ...mailBooking, listingTitle: "Villa\r\nBcc: x@y" },
    manageUrl: "https://app.test/reservation/abc",
  });
  assert.match(mail.text, /Suivre ou annuler ma demande : https:\/\/app\.test\/reservation\/abc/);
  assert.equal(/[\r\n]/.test(mail.subject), false);
});

test("destinataire voyageur : compte s'il existe, sinon fiche de contact", () => {
  assert.deepEqual(guestRecipient({ guest: { email: "u@x.test", name: "U" }, contactEmail: "c@x.test" }), {
    email: "u@x.test",
    name: "U",
  });
  assert.deepEqual(guestRecipient({ guest: null, contactEmail: "c@x.test", contactName: "C" }), {
    email: "c@x.test",
    name: "C",
  });
});

test("logs : le jeton du lien de suivi est masqué dans l'URL", () => {
  const token = "a".repeat(43);
  assert.equal(maskSensitiveUrl(`/api/guest-bookings/${token}/cancel`), "/api/guest-bookings/[masqué]/cancel");
  assert.equal(maskSensitiveUrl(`/api/guest-bookings/${token}?x=1`), "/api/guest-bookings/[masqué]?x=1");
  assert.equal(maskSensitiveUrl("/api/listings/1"), "/api/listings/1");
});

// --- Routes (sans base : rejets avant tout accès à Prisma) -------------------------------------

test("routes : piège -> 400 générique, corps invalide -> 400 détaillé, jeton mal formé -> 404 no-referrer", async () => {
  const { default: express } = await import("express");
  const { default: listingsRoutes } = await import("../src/api/listings/listings.routes.js");
  const { default: guestBookingsRoutes } = await import("../src/api/guestBookings/guestBookings.routes.js");
  const { errorHandler } = await import("../src/middleware/errorHandler.js");
  const app = express();
  app.use(express.json());
  app.use("/api/listings", listingsRoutes);
  app.use("/api/guest-bookings", guestBookingsRoutes);
  app.use(errorHandler);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const post = (b) =>
      fetch(`${base}/api/listings/l1/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
    const trap = await post(body({ website: "spam", acceptTerms: false }));
    assert.equal(trap.status, 400);
    assert.deepEqual(await trap.json(), { error: "Requête invalide" });

    const noTerms = await post(body({ acceptTerms: undefined }));
    assert.equal(noTerms.status, 400);
    const details = (await noTerms.json()).details.map((d) => d.path);
    assert.ok(details.includes("acceptTerms"));

    const guest = await fetch(`${base}/api/guest-bookings/court`);
    assert.equal(guest.status, 404);
    assert.equal(guest.headers.get("referrer-policy"), "no-referrer");
    assert.equal(guest.headers.get("cache-control"), "no-store");
  } finally {
    server.close();
  }
});
