import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

process.env.JWT_SECRET = "secret-de-test-suffisamment-long-pour-hs256-0123456789";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.DIRECT_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.NODE_ENV = "test";
process.env.STORAGE_DRIVER = "local";
process.env.EMAIL_DRIVER = "console";
process.env.APP_URL = "http://localhost:3000";
process.env.PAYMENTS_ENABLED = "true";
process.env.PAYMENT_PROVIDER = "fake";
process.env.LOG_LEVEL = "silent";

const {
  computeCinetPayToken,
  verifyCinetPayToken,
  payableAmount,
  normalizeProviderStatus,
  generateTransactionId,
  isTransactionIdFormat,
} = await import("../src/utils/payment.js");
const { effectiveStatus, blockingBookingWhere, findStayConflict } = await import("../src/utils/bookingStatus.js");
const { createCinetPayProvider } = await import("../src/services/paymentProviders/cinetpay.js");
const { createFakeProvider } = await import("../src/services/paymentProviders/fake.js");
const payments = await import("../src/services/payments.js");
const { createBooking, confirmBooking, cancelBooking, sweepUnpaid } = await import("../src/services/bookings.js");
const { bookingToJson } = await import("../src/api/bookings/bookings.serializers.js");
const { createPaymentsRouter } = await import("../src/api/payments/payments.routes.js");
const { errorHandler } = await import("../src/middleware/errorHandler.js");
const { addDays, todayDay } = await import("../src/utils/booking.js");
const { default: express } = await import("express");

const day = (n) => addDays(todayDay(), n);
const TX = `AFB${"0123456789ABCDEF".repeat(2)}`;
const SECRET = "secret-de-test-cinetpay";
const SITE_ID = "5869001";
const MIN = 60 * 1000;

async function rejects(promise, statusCode, message) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.statusCode, statusCode);
    if (message) assert.equal(err.message, message);
    return true;
  });
}

// --- HMAC x-token (vecteur construit d'après la page « CinetPay X-TOKEN HMAC ») -------------------

// Corps d'une notification : tous les champs listés par la documentation.
const notification = {
  cpm_site_id: SITE_ID,
  cpm_trans_id: TX,
  cpm_trans_date: "2026-10-22 19:19:00",
  cpm_amount: "150",
  cpm_currency: "XOF",
  signature: "sig-test",
  payment_method: "OMTG",
  cel_phone_num: "90000000",
  cpm_phone_prefixe: "228",
  cpm_language: "fr",
  cpm_version: "V4",
  cpm_payment_config: "Single",
  cpm_page_action: "Payment",
  cpm_custom: "bk_123",
  cpm_designation: "Reservation AfrikaBnB",
  cpm_error_message: "SUCCES",
};

test("HMAC : concaténation des 16 champs dans l'ordre documenté, HMAC-SHA256 hexadécimal (hash_hmac PHP)", () => {
  // Valeur calculée indépendamment (Python hmac/hashlib) sur la chaîne :
  // cpm_site_id + cpm_trans_id + cpm_trans_date + cpm_amount + cpm_currency + signature + payment_method
  // + cel_phone_num + cpm_phone_prefixe + cpm_language + cpm_version + cpm_payment_config
  // + cpm_page_action + cpm_custom + cpm_designation + cpm_error_message
  const expected = "a2945adf1303e68ba361af94a20fc8916c061f91240228d326c452d4519cae6a";
  assert.equal(computeCinetPayToken(notification, SECRET), expected);
  // L'ordre des clés de l'objet n'intervient pas.
  const shuffled = Object.fromEntries(Object.entries(notification).reverse());
  assert.equal(computeCinetPayToken(shuffled, SECRET), expected);
  // Champs inconnus ignorés ; champ absent = chaîne vide.
  assert.equal(computeCinetPayToken({ ...notification, extra: "x" }, SECRET), expected);
  const { cpm_custom: _custom, ...withoutCustom } = notification;
  assert.equal(computeCinetPayToken(withoutCustom, SECRET), computeCinetPayToken({ ...notification, cpm_custom: "" }, SECRET));
});

test("HMAC : jeton valide accepté ; altéré, autre clé, vide ou de longueur différente rejeté", () => {
  const token = computeCinetPayToken(notification, SECRET);
  assert.equal(verifyCinetPayToken(notification, token, SECRET), true);
  assert.equal(verifyCinetPayToken({ ...notification, cpm_amount: "100" }, token, SECRET), false);
  assert.equal(verifyCinetPayToken(notification, token, "autre-cle"), false);
  assert.equal(verifyCinetPayToken(notification, "", SECRET), false);
  assert.equal(verifyCinetPayToken(notification, undefined, SECRET), false);
  assert.equal(verifyCinetPayToken(notification, token.slice(0, -1), SECRET), false);
  assert.equal(verifyCinetPayToken(notification, token, ""), false);
});

// --- Montant, identifiants, statuts ----------------------------------------------------------

test("montant : arrondi à l'unité puis au multiple de 5 SUPÉRIEUR (contrainte CinetPay XOF)", () => {
  assert.equal(payableAmount(100), 100);
  assert.equal(payableAmount("135000.00"), 135000);
  assert.equal(payableAmount(101), 105);
  assert.equal(payableAmount(100.01), 105);
  assert.equal(payableAmount(99.5), 100);
  assert.equal(payableAmount(1234.56), 1235);
  assert.equal(payableAmount(0.1 + 0.2), 5);
  assert.equal(payableAmount(0), 0);
  assert.equal(payableAmount("abc"), 0);
});

test("transactionId : aléatoire, format sans caractères déconseillés (# / $ _ &), unique", () => {
  const a = generateTransactionId();
  const b = generateTransactionId();
  assert.notEqual(a, b);
  assert.equal(isTransactionIdFormat(a), true);
  assert.doesNotMatch(a, /[#/$_&]/);
  assert.equal(isTransactionIdFormat("AFB123"), false);
  assert.equal(isTransactionIdFormat(`${TX}/`), false);
});

test("statut prestataire : ACCEPTED seul succès ; REFUSED/CANCELED échec ; le reste en attente", () => {
  assert.equal(normalizeProviderStatus("ACCEPTED"), "ACCEPTED");
  assert.equal(normalizeProviderStatus("REFUSED"), "REFUSED");
  assert.equal(normalizeProviderStatus("CANCELED"), "REFUSED");
  assert.equal(normalizeProviderStatus("WAITING_FOR_CUSTOMER"), "PENDING");
  assert.equal(normalizeProviderStatus(undefined), "PENDING");
  assert.equal(normalizeProviderStatus("SUCCES"), "PENDING");
});

// --- Base en mémoire --------------------------------------------------------------------------

const settings = {
  enabled: true,
  provider: "cinetpay",
  apiUrl: "https://app.example",
  dueMinutesInstant: 30,
  dueHoursRequest: 24,
};

function makeBooking(over = {}) {
  return {
    id: "bk1",
    listingId: "l1",
    guestId: "guest",
    status: "CONFIRMED",
    checkIn: new Date(`${day(10)}T00:00:00.000Z`),
    checkOut: new Date(`${day(12)}T00:00:00.000Z`),
    createdAt: new Date(),
    totalPrice: "20001.00",
    paymentStatus: "UNPAID",
    paymentDueAt: new Date(Date.now() + 20 * MIN),
    paidAt: null,
    guestAccessTokenHash: null,
    ...over,
  };
}

// Client Prisma factice : Booking, Payment, verrous ($queryRaw) et transactions.
function memoryDb({ bookings = [makeBooking()], payments: initialPayments = [], others = [] } = {}) {
  const bookingsById = new Map(bookings.map((b) => [b.id, { ...b }]));
  const paymentsById = new Map(initialPayments.map((p) => [p.id, { ...p }]));
  const log = { queries: [], bookingUpdates: [], paymentUpdates: [], created: [] };
  let seq = 0;
  const findPayment = (where) =>
    [...paymentsById.values()].find((p) => (where.id ? p.id === where.id : p.transactionId === where.transactionId)) ?? null;
  const db = {
    $queryRaw: async (strings, ...values) => {
      log.queries.push(strings.join("?"));
      if (strings.join("").includes('FROM "Booking"')) return bookingsById.has(values[0]) ? [{ id: values[0] }] : [];
      return [{ id: values[0] }];
    },
    $transaction: async (fn) => fn(db),
    booking: {
      findUnique: async ({ where, include }) => {
        const b = where.id
          ? bookingsById.get(where.id)
          : [...bookingsById.values()].find((x) => x.guestAccessTokenHash === where.guestAccessTokenHash);
        if (!b) return null;
        return include?.listing ? { ...b, listing: { currency: "XOF", hostId: "host", status: "ACTIVE" } } : { ...b };
      },
      findMany: async ({ where }) => {
        if (where.listingId) return others;
        return [...bookingsById.values()].filter(
          (b) => b.status === "CONFIRMED" && b.paymentStatus === "UNPAID" && b.paymentDueAt <= where.paymentDueAt.lte
        );
      },
      update: async ({ where, data }) => {
        log.bookingUpdates.push(data);
        Object.assign(bookingsById.get(where.id), data);
        return { ...bookingsById.get(where.id) };
      },
      updateMany: async ({ where, data }) => {
        const b = bookingsById.get(where.id);
        const match = b && b.status === where.status && b.paymentStatus === where.paymentStatus && b.paymentDueAt <= where.paymentDueAt.lte;
        if (!match) return { count: 0 };
        log.bookingUpdates.push(data);
        Object.assign(b, data);
        return { count: 1 };
      },
    },
    blockedPeriod: { findMany: async () => [] },
    payment: {
      findUnique: async ({ where, include }) => {
        const p = findPayment(where);
        if (!p) return null;
        return include?.booking ? { ...p, booking: { ...bookingsById.get(p.bookingId) } } : { ...p };
      },
      findFirst: async ({ where }) =>
        [...paymentsById.values()]
          .filter(
            (p) =>
              p.bookingId === where.bookingId &&
              p.provider === where.provider &&
              p.status === where.status &&
              (where.paymentUrl ? p.paymentUrl != null : true)
          )
          .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null,
      // Balayage (bookingId in) et réconciliation (createdAt lt / gt).
      findMany: async ({ where }) =>
        [...paymentsById.values()].filter(
          (p) =>
            p.status === where.status &&
            p.paymentUrl != null &&
            (where.bookingId ? where.bookingId.in.includes(p.bookingId) : true) &&
            (where.createdAt ? p.createdAt < where.createdAt.lt && p.createdAt > where.createdAt.gt : true)
        ),
      updateMany: async ({ where, data }) => {
        const p = paymentsById.get(where.id);
        if (!p || !where.status.in.includes(p.status)) return { count: 0 };
        log.paymentUpdates.push(data);
        Object.assign(p, data);
        return { count: 1 };
      },
      count: async ({ where }) => [...paymentsById.values()].filter((p) => p.bookingId === where.bookingId).length,
      create: async ({ data }) => {
        const p = { id: `p${++seq}`, createdAt: new Date(), paymentUrl: null, providerRef: null, rawStatus: null, paidAt: null, ...data };
        paymentsById.set(p.id, p);
        log.created.push(p);
        return { ...p };
      },
      update: async ({ where, data }) => {
        log.paymentUpdates.push(data);
        Object.assign(paymentsById.get(where.id), data);
        return { ...paymentsById.get(where.id) };
      },
    },
  };
  return { db, log, booking: (id = "bk1") => bookingsById.get(id), payment: (id = "p1") => paymentsById.get(id) };
}

const pendingPayment = (over = {}) => ({
  id: "p1",
  bookingId: "bk1",
  provider: "cinetpay",
  transactionId: TX,
  amount: "20005",
  currency: "XOF",
  status: "PENDING",
  paymentUrl: "https://checkout.cinetpay.com/payment/tok",
  rawStatus: null,
  createdAt: new Date(),
  ...over,
});

// fetch factice de l'API CinetPay : réponses par chemin, appels enregistrés.
function fakeCinetPay(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname.replace("/v2", "");
    const body = JSON.parse(init.body);
    calls.push({ path, body });
    const r = typeof responses[path] === "function" ? responses[path](body) : responses[path];
    return { status: 200, json: async () => r };
  };
  const provider = createCinetPayProvider({ apiKey: "api-key-test", siteId: SITE_ID, secretKey: SECRET, fetchImpl, baseUrl: "https://cinetpay.test/v2" });
  return { provider, calls };
}

const checkResponse = (status, over = {}) => ({
  code: status === "ACCEPTED" ? "00" : "627",
  message: status === "ACCEPTED" ? "SUCCES" : "TRANSACTION_CANCEL",
  data: { amount: "20005", currency: "XOF", status, payment_method: "OMTG", operator_id: "OP123", ...over },
});

// --- Vérification systématique et idempotence --------------------------------------------------

test("notification : statut TOUJOURS demandé à /payment/check (jamais lu dans la notification)", async () => {
  const mem = memoryDb({ payments: [pendingPayment()] });
  const { provider, calls } = fakeCinetPay({ "/payment/check": checkResponse("REFUSED") });
  // La notification annonce « SUCCES », la vérification répond REFUSED : c'est REFUSED qui compte.
  const result = await payments.syncPayment({ transactionId: TX, siteId: SITE_ID }, { db: mem.db, provider, settings });
  assert.equal(result.outcome, "refused");
  assert.deepEqual(calls.map((c) => c.path), ["/payment/check"]);
  assert.deepEqual(calls[0].body, { apikey: "api-key-test", site_id: SITE_ID, transaction_id: TX });
  assert.equal(mem.payment().status, "REFUSED");
  // Réservation toujours payable jusqu'à l'échéance.
  assert.equal(mem.booking().paymentStatus, "UNPAID");
  assert.equal(mem.booking().status, "CONFIRMED");
});

test("notification acceptée : PAID sous verrous (annonce puis réservation) ; une 2e notification ne change rien", async () => {
  const mem = memoryDb({ payments: [pendingPayment()] });
  const { provider, calls } = fakeCinetPay({ "/payment/check": checkResponse("ACCEPTED") });
  const deps = { db: mem.db, provider, settings };
  const first = await payments.syncPayment({ transactionId: TX, siteId: SITE_ID }, deps);
  assert.equal(first.outcome, "paid");
  assert.equal(first.amount, 20005);
  assert.equal(mem.booking().paymentStatus, "PAID");
  assert.ok(mem.booking().paidAt instanceof Date);
  assert.equal(mem.payment().status, "ACCEPTED");
  assert.equal(mem.payment().operatorId, "OP123");
  assert.equal(mem.payment().method, "OMTG");
  assert.match(mem.log.queries[0], /FROM "Listing" WHERE "id" = \? FOR UPDATE/);
  assert.match(mem.log.queries[1], /FROM "Booking" WHERE "id" = \? FOR UPDATE/);

  const updates = mem.log.bookingUpdates.length;
  const second = await payments.syncPayment({ transactionId: TX, siteId: SITE_ID }, deps);
  assert.equal(second.outcome, "already_final");
  assert.equal(mem.log.bookingUpdates.length, updates);
  // Déjà accepté : pas de nouvel appel au prestataire.
  assert.equal(calls.length, 1);
});

test("notification : montant ou devise discordants -> paiement à rembourser (AMOUNT_MISMATCH), alerte unique ; site_id étranger -> ignorée", async () => {
  for (const over of [{ amount: "100" }, { currency: "XAF" }]) {
    const mem = memoryDb({ payments: [pendingPayment()] });
    const { provider, calls } = fakeCinetPay({ "/payment/check": checkResponse("ACCEPTED", over) });
    const r = await payments.syncPayment({ transactionId: TX, siteId: SITE_ID }, { db: mem.db, provider, settings });
    assert.equal(r.outcome, "mismatch");
    assert.equal(r.firstDetection, true);
    assert.equal(mem.payment().status, "REFUND_DUE");
    assert.equal(mem.payment().rawStatus, "AMOUNT_MISMATCH");
    // La réservation n'est pas validée et reste payable.
    assert.equal(mem.booking().paymentStatus, "UNPAID");
    assert.equal(mem.log.bookingUpdates.length, 0);
    // Notification répétée : statut définitif, aucune nouvelle alerte ni appel.
    const again = await payments.syncPayment({ transactionId: TX, siteId: SITE_ID }, { db: mem.db, provider, settings });
    assert.equal(again.outcome, "already_final");
    assert.equal(calls.length, 1);
  }
  const mem = memoryDb({ payments: [pendingPayment()] });
  const { provider, calls } = fakeCinetPay({ "/payment/check": checkResponse("ACCEPTED") });
  const r = await payments.syncPayment({ transactionId: TX, siteId: "999" }, { db: mem.db, provider, settings });
  assert.equal(r.outcome, "site_mismatch");
  assert.equal(calls.length, 0);
});

test("notification : transaction inconnue ou mal formée -> ignorée, sans appel au prestataire", async () => {
  const mem = memoryDb({ payments: [] });
  const { provider, calls } = fakeCinetPay({ "/payment/check": checkResponse("ACCEPTED") });
  assert.equal((await payments.syncPayment({ transactionId: TX, siteId: SITE_ID }, { db: mem.db, provider, settings })).outcome, "unknown");
  assert.equal((await payments.syncPayment({ transactionId: "x'; drop", siteId: SITE_ID }, { db: mem.db, provider, settings })).outcome, "unknown");
  assert.equal(calls.length, 0);
});

test("paiement accepté après annulation -> REFUND_DUE, réservation NON réactivée", async () => {
  const mem = memoryDb({ bookings: [makeBooking({ status: "CANCELLED" })], payments: [pendingPayment()] });
  const { provider } = fakeCinetPay({ "/payment/check": checkResponse("ACCEPTED") });
  const r = await payments.syncPayment({ transactionId: TX, siteId: SITE_ID }, { db: mem.db, provider, settings });
  assert.equal(r.outcome, "refund_due");
  assert.equal(mem.booking().status, "CANCELLED");
  assert.equal(mem.booking().paymentStatus, "REFUND_DUE");
  assert.equal(mem.payment().status, "ACCEPTED");
});

test("paiement accepté après l'échéance : délai de grâce si dates libres, sinon annulation + REFUND_DUE", async () => {
  const late = (minutes, others = []) =>
    memoryDb({ bookings: [makeBooking({ paymentDueAt: new Date(Date.now() - minutes * MIN) })], payments: [pendingPayment()], others });
  const { provider } = fakeCinetPay({ "/payment/check": checkResponse("ACCEPTED") });

  const grace = late(5);
  assert.equal((await payments.syncPayment({ transactionId: TX, siteId: SITE_ID }, { db: grace.db, provider, settings })).outcome, "paid");

  const taken = late(5, [{ id: "other", status: "CONFIRMED", createdAt: new Date(), checkIn: day(11), checkOut: day(13) }]);
  const r1 = await payments.syncPayment({ transactionId: TX, siteId: SITE_ID }, { db: taken.db, provider, settings });
  assert.equal(r1.outcome, "refund_due");
  assert.equal(r1.cancelledNow, true);
  assert.equal(taken.booking().status, "CANCELLED");
  assert.equal(taken.booking().paymentStatus, "REFUND_DUE");

  const tooLate = late(60);
  const r2 = await payments.syncPayment({ transactionId: TX, siteId: SITE_ID }, { db: tooLate.db, provider, settings });
  assert.equal(r2.outcome, "refund_due");
  assert.equal(tooLate.booking().status, "CANCELLED");
});

test("paiement accepté sur une réservation déjà payée -> doublon signalé, réservation inchangée", async () => {
  const mem = memoryDb({ bookings: [makeBooking({ paymentStatus: "PAID" })], payments: [pendingPayment()] });
  const { provider } = fakeCinetPay({ "/payment/check": checkResponse("ACCEPTED") });
  const r = await payments.syncPayment({ transactionId: TX, siteId: SITE_ID }, { db: mem.db, provider, settings });
  assert.equal(r.outcome, "duplicate");
  assert.equal(mem.booking().paymentStatus, "PAID");
  // Le paiement en double est suivi pour remboursement.
  assert.equal(mem.payment().status, "REFUND_DUE");
  assert.equal(mem.payment().operatorId, "OP123");
});

// --- Lancement du paiement ---------------------------------------------------------------------

test("startPayment : montant arrondi (20001 -> 20005 XOF), initialisation CinetPay conforme, puis réutilisation", async () => {
  const mem = memoryDb();
  const { provider, calls } = fakeCinetPay({
    "/payment": { code: "201", message: "CREATED", data: { payment_token: "tok", payment_url: "https://checkout.cinetpay.com/payment/tok" } },
    "/payment/check": checkResponse("WAITING_FOR_CUSTOMER"),
  });
  const deps = { db: mem.db, provider, settings };
  const view = await payments.startPayment({ bookingId: "bk1", user: { id: "guest" }, lang: "en" }, deps);
  assert.equal(view.amount, 20005);
  assert.equal(view.currency, "XOF");
  assert.equal(view.paymentUrl, "https://checkout.cinetpay.com/payment/tok");
  assert.equal(view.reused, false);
  assert.ok(isTransactionIdFormat(view.transactionId));
  const init = calls[0];
  assert.equal(init.path, "/payment");
  assert.equal(init.body.amount, 20005);
  assert.equal(init.body.amount % 5, 0);
  assert.equal(init.body.currency, "XOF");
  assert.equal(init.body.site_id, SITE_ID);
  assert.equal(init.body.channels, "MOBILE_MONEY");
  assert.equal(init.body.lang, "en");
  assert.equal(init.body.transaction_id, view.transactionId);
  assert.equal(init.body.notify_url, "https://app.example/api/payments/cinetpay/notify");
  assert.equal(init.body.return_url, `https://app.example/api/payments/return?tx=${view.transactionId}`);
  assert.doesNotMatch(init.body.description, /[#/$_&]/);
  // Aucune donnée personnelle transmise.
  assert.equal(Object.keys(init.body).some((k) => k.startsWith("customer_")), false);
  assert.match(mem.log.queries[0], /FROM "Booking" WHERE "id" = \? FOR UPDATE/);

  // Paiement en cours : d'abord vérifié auprès du prestataire (toujours en attente), puis réutilisé.
  const again = await payments.startPayment({ bookingId: "bk1", user: { id: "guest" } }, deps);
  assert.equal(again.reused, true);
  assert.equal(again.transactionId, view.transactionId);
  assert.deepEqual(calls.map((c) => c.path), ["/payment", "/payment/check"]);
  assert.equal(mem.log.created.length, 1);
});

test("startPayment : paiement en cours accepté chez le prestataire -> appliqué, pas de second paiement (409)", async () => {
  const mem = memoryDb({ payments: [pendingPayment({ createdAt: new Date(Date.now() - 2 * MIN) })] });
  const { provider, calls } = fakeCinetPay({ "/payment/check": checkResponse("ACCEPTED") });
  const synced = [];
  await rejects(
    payments.startPayment({ bookingId: "bk1", user: { id: "guest" } }, { db: mem.db, provider, settings, onSync: (r) => synced.push(r.outcome) }),
    409,
    "Cette réservation est déjà payée"
  );
  assert.deepEqual(synced, ["paid"]);
  assert.equal(mem.booking().paymentStatus, "PAID");
  assert.equal(mem.log.created.length, 0);
  assert.deepEqual(calls.map((c) => c.path), ["/payment/check"]);
});

test("startPayment : initialisation en cours (< 30 s, sans lien) -> 409 ; ancien paiement de statut inconnu -> 502 sans nouveau paiement", async () => {
  const init = memoryDb({ payments: [pendingPayment({ paymentUrl: null, createdAt: new Date(Date.now() - 5000) })] });
  const { provider } = fakeCinetPay({});
  await rejects(
    payments.startPayment({ bookingId: "bk1", user: { id: "guest" } }, { db: init.db, provider, settings }),
    409,
    "Paiement en cours d'initialisation, réessayez dans quelques secondes"
  );
  assert.equal(init.log.created.length, 0);

  const old = memoryDb({ payments: [pendingPayment({ createdAt: new Date(Date.now() - 25 * MIN) })] });
  const down = createCinetPayProvider({
    apiKey: "k",
    siteId: SITE_ID,
    secretKey: SECRET,
    baseUrl: "https://cinetpay.test/v2",
    fetchImpl: async () => {
      throw new Error("ECONNRESET");
    },
  });
  await assert.rejects(
    payments.startPayment({ bookingId: "bk1", user: { id: "guest" } }, { db: old.db, provider: down, settings }),
    (err) => err.statusCode === 502 && err.expose === true
  );
  assert.equal(old.log.created.length, 0);

  // Ancien paiement toujours en attente (vérifié) : un nouveau paiement est créé.
  const stale = memoryDb({ payments: [pendingPayment({ createdAt: new Date(Date.now() - 25 * MIN) })] });
  const ok = fakeCinetPay({
    "/payment/check": checkResponse("WAITING_FOR_CUSTOMER"),
    "/payment": { code: "201", data: { payment_token: "t2", payment_url: "https://checkout.cinetpay.com/payment/t2" } },
  });
  const view = await payments.startPayment({ bookingId: "bk1", user: { id: "guest" } }, { db: stale.db, provider: ok.provider, settings });
  assert.equal(view.reused, false);
  assert.notEqual(view.transactionId, TX);
});

test("startPayment : réservation d'autrui -> 404 ; non payable -> 409 ; prestataire en échec -> 502 et paiement FAILED", async () => {
  const { provider } = fakeCinetPay({ "/payment": { code: "608", message: "MINIMUM_REQUIRED_FIELDS" } });
  const other = memoryDb();
  await rejects(payments.startPayment({ bookingId: "bk1", user: { id: "intrus" } }, { db: other.db, provider, settings }), 404);
  for (const over of [{ paymentStatus: "PAID" }, { status: "CANCELLED" }, { paymentDueAt: new Date(Date.now() - MIN) }, { status: "PENDING", paymentStatus: "NONE" }]) {
    const mem = memoryDb({ bookings: [makeBooking(over)] });
    await rejects(payments.startPayment({ bookingId: "bk1", user: { id: "guest" } }, { db: mem.db, provider, settings }), 409);
    assert.equal(mem.log.created.length, 0);
  }
  const failing = memoryDb();
  await rejects(payments.startPayment({ bookingId: "bk1", user: { id: "guest" } }, { db: failing.db, provider, settings }), 502);
  assert.equal(failing.payment().status, "FAILED");
});

test("startPayment : voyageur sans compte authentifié par le jeton de son lien", async () => {
  const { hashGuestAccessToken } = await import("../src/utils/guestAccess.js");
  const token = "g".repeat(43);
  const mem = memoryDb({
    bookings: [makeBooking({ guestId: null, guestAccessTokenHash: hashGuestAccessToken(token), guestAccessExpiresAt: new Date(Date.now() + 86400000) })],
  });
  const provider = createFakeProvider({ apiUrl: "http://localhost:3000" });
  const view = await payments.startPayment({ guestToken: token }, { db: mem.db, provider, settings: { ...settings, provider: "fake" } });
  assert.equal(view.paymentUrl, `http://localhost:3000/api/payments/fake/${view.transactionId}`);
  await rejects(payments.startPayment({ guestToken: "x".repeat(43) }, { db: mem.db, provider, settings }), 404);
});

// --- Échéance : annulation et libération des dates ----------------------------------------------

test("échéance dépassée : statut CANCELLED exposé, dates libérées (JS et filtre Prisma), balayage conditionnel", async () => {
  const now = new Date();
  const overdue = makeBooking({ paymentDueAt: new Date(now.getTime() - MIN) });
  const unpaidOk = makeBooking({ id: "bk2" });
  assert.equal(effectiveStatus(overdue, now), "CANCELLED");
  assert.equal(effectiveStatus(unpaidOk, now), "CONFIRMED");
  assert.equal(bookingToJson({ ...overdue, totalPrice: "20001" }, now).status, "CANCELLED");
  // UNPAID avant l'échéance : bloquant ; après : libre.
  const stay = { checkIn: day(10), checkOut: day(12), now };
  assert.equal(findStayConflict({ ...stay, bookings: [overdue] }), null);
  assert.deepEqual(findStayConflict({ ...stay, bookings: [unpaidOk] }), { type: "booking", id: "bk2" });
  const confirmed = blockingBookingWhere(now).OR[0];
  assert.equal(confirmed.status, "CONFIRMED");
  assert.deepEqual(confirmed.OR, [{ paymentStatus: { not: "UNPAID" } }, { paymentDueAt: null }, { paymentDueAt: { gt: now } }]);

  // Balayage en base seulement après le délai de grâce de 15 min.
  const mem = memoryDb({ bookings: [overdue, unpaidOk, makeBooking({ id: "bk3", paymentDueAt: new Date(now.getTime() - 16 * MIN) })] });
  assert.deepEqual(await sweepUnpaid({ guestId: "guest" }, mem.db, now), ["bk3"]);
  assert.equal(mem.booking("bk1").status, "CONFIRMED");
  assert.equal(mem.booking("bk3").status, "CANCELLED");
  assert.equal(mem.booking("bk2").status, "CONFIRMED");
  // Second balayage (concurrent ou suivant) : rien à faire, pas de second e-mail.
  assert.deepEqual(await sweepUnpaid({ guestId: "guest" }, mem.db, now), []);
});

test("paiements désactivés : une réservation UNPAID échue n'est jamais exposée annulée", () => {
  const overdue = makeBooking({ paymentDueAt: new Date(Date.now() - 60 * MIN) });
  process.env.PAYMENTS_ENABLED = "false";
  try {
    assert.equal(effectiveStatus(overdue), "CONFIRMED");
    assert.deepEqual(blockingBookingWhere().OR[0], { status: "CONFIRMED" });
  } finally {
    process.env.PAYMENTS_ENABLED = "true";
  }
  assert.equal(effectiveStatus(overdue), "CANCELLED");
});

test("balayage : paiement en cours revérifié avant d'annuler ; accepté -> payé ; prestataire injoignable -> pas d'annulation", async () => {
  const now = new Date();
  const due = new Date(now.getTime() - 20 * MIN);
  // Accepté chez le prestataire au moment du balayage (au-delà de la grâce) : jamais annulée « faute
  // de paiement » ; le paiement est appliqué (ici REFUND_DUE car l'échéance + grâce est dépassée).
  const accepted = memoryDb({ bookings: [makeBooking({ paymentDueAt: due })], payments: [pendingPayment()] });
  const ok = fakeCinetPay({ "/payment/check": checkResponse("ACCEPTED") });
  const synced = [];
  const r1 = await sweepUnpaid({}, accepted.db, now, { provider: ok.provider, settings, onSync: (r) => synced.push(r.outcome) });
  assert.deepEqual(r1, []);
  assert.deepEqual(synced, ["refund_due"]);
  assert.equal(accepted.payment().status, "ACCEPTED");

  // Prestataire injoignable : la réservation n'est pas annulée (nouvel essai au prochain balayage).
  const down = memoryDb({ bookings: [makeBooking({ paymentDueAt: due })], payments: [pendingPayment()] });
  const broken = createCinetPayProvider({
    apiKey: "k",
    siteId: SITE_ID,
    secretKey: SECRET,
    baseUrl: "https://cinetpay.test/v2",
    fetchImpl: async () => {
      throw new Error("ECONNRESET");
    },
  });
  const outcomes = [];
  assert.deepEqual(await sweepUnpaid({}, down.db, now, { provider: broken, settings, onSync: (r) => outcomes.push(r.outcome) }), []);
  assert.deepEqual(outcomes, ["error"]);
  assert.equal(down.booking().status, "CONFIRMED");

  // Toujours en attente chez le prestataire : annulée ; plafond d'appels par balayage respecté.
  const many = memoryDb({
    bookings: [makeBooking({ paymentDueAt: due }), makeBooking({ id: "bk2", paymentDueAt: due })],
    payments: [pendingPayment(), pendingPayment({ id: "p2", bookingId: "bk2", transactionId: `AFB${"B".repeat(32)}` })],
  });
  const waiting = fakeCinetPay({ "/payment/check": checkResponse("WAITING_FOR_CUSTOMER") });
  const cancelled = await sweepUnpaid({}, many.db, now, { provider: waiting.provider, settings, maxChecks: 1 });
  assert.deepEqual(cancelled, ["bk1"]);
  assert.equal(waiting.calls.length, 1);
  assert.equal(many.booking("bk2").status, "CONFIRMED");
});

test("réconciliation : paiements PENDING anciens vérifiés (notification perdue) puis impayés échus annulés", async () => {
  const { runPaymentReconciliation, startPaymentReconciler } = await import("../src/api/payments/payments.reconciler.js");
  const now = new Date();
  const mem = memoryDb({
    bookings: [makeBooking(), makeBooking({ id: "bk2", paymentDueAt: new Date(now.getTime() - 20 * MIN) })],
    payments: [pendingPayment({ createdAt: new Date(now.getTime() - 5 * MIN) })],
  });
  const { provider, calls } = fakeCinetPay({ "/payment/check": checkResponse("ACCEPTED") });
  const log = { info() {}, warn() {}, error() {}, debug() {} };
  const cancelled = await runPaymentReconciliation({ db: mem.db, provider, settings, now }, log);
  assert.equal(mem.booking().paymentStatus, "PAID");
  assert.deepEqual(cancelled, ["bk2"]);
  assert.equal(calls.length, 1);
  // Désactivée sans paiements ou en test.
  assert.equal(startPaymentReconciler({ settings: { enabled: false }, nodeEnv: "production", log }), null);
  assert.equal(startPaymentReconciler({ settings, nodeEnv: "test", log }), null);
  const stop = startPaymentReconciler({ settings, nodeEnv: "production", log, intervalMs: 60 * 60 * 1000 });
  assert.equal(typeof stop, "function");
  stop();
});

test("bookingToJson : montant exact à payer (XOF, arrondi) exposé dès qu'un paiement est attendu", () => {
  const json = bookingToJson(makeBooking());
  assert.equal(json.paymentStatus, "UNPAID");
  assert.equal(json.paymentAmount, 20005);
  assert.equal(json.paymentCurrency, "XOF");
  assert.equal("paymentAmount" in bookingToJson(makeBooking({ paymentStatus: "NONE" })), false);
});

// --- Transitions de réservation ----------------------------------------------------------------

function transitionDb(booking) {
  const t = { updates: [] };
  const tx = {
    booking: {
      findUnique: async ({ include }) =>
        include ? { ...booking, listing: { hostId: "host", status: "ACTIVE" } } : { ...booking },
      update: async ({ data }) => (t.updates.push(data), { ...booking, ...data }),
      findMany: async () => [],
    },
    blockedPeriod: { findMany: async () => [] },
    $queryRaw: async () => [{ id: booking.listingId }],
  };
  t.db = { $transaction: async (fn) => fn(tx), booking: { findUnique: async () => ({ ...booking, listing: null }) } };
  return t;
}

test("création instantanée -> UNPAID, échéance +30 min ; demande acceptée -> UNPAID, échéance +24 h", async () => {
  const created = {};
  const tx = {
    $queryRaw: async () => [{ id: "l1", hostId: "host", pricePerNight: "100.00", maxGuests: 4, instantBook: true, status: "ACTIVE" }],
    booking: { findMany: async () => [], create: async ({ data }) => (Object.assign(created, data), { id: "b-new", ...data }) },
    blockedPeriod: { findMany: async () => [] },
  };
  const contact = { name: "Ama Mensah", email: "ama@example.com", phone: "+228 90 00 00 00", country: "TG" };
  const before = Date.now();
  await createBooking({ listingId: "l1", user: { id: "guest" }, checkIn: day(10), checkOut: day(12), guests: 2, contact }, { $transaction: async (fn) => fn(tx) });
  assert.equal(created.status, "CONFIRMED");
  assert.equal(created.paymentStatus, "UNPAID");
  const due = created.paymentDueAt.getTime() - before;
  assert.ok(due >= 30 * MIN - 1000 && due <= 30 * MIN + 1000);

  const pending = makeBooking({ status: "PENDING", paymentStatus: "NONE", paymentDueAt: null, createdAt: new Date() });
  const t = transitionDb(pending);
  await confirmBooking({ bookingId: "bk1", user: { id: "host" } }, t.db);
  assert.equal(t.updates[0].status, "CONFIRMED");
  assert.equal(t.updates[0].paymentStatus, "UNPAID");
  const dueReq = t.updates[0].paymentDueAt.getTime() - Date.now();
  assert.ok(dueReq > 24 * 60 * MIN - 5000 && dueReq <= 24 * 60 * MIN);
});

test("annulation d'une réservation payée -> CANCELLED + REFUND_DUE ; non payée -> statut de paiement inchangé", async () => {
  const paid = transitionDb(makeBooking({ paymentStatus: "PAID", paymentDueAt: null }));
  const outcome = await cancelBooking({ bookingId: "bk1", user: { id: "guest" } }, paid.db);
  assert.deepEqual(paid.updates, [{ status: "CANCELLED", paymentStatus: "REFUND_DUE" }]);
  assert.equal(outcome.refundDue, true);

  const unpaid = transitionDb(makeBooking());
  const o2 = await cancelBooking({ bookingId: "bk1", user: { id: "guest" } }, unpaid.db);
  assert.deepEqual(unpaid.updates, [{ status: "CANCELLED" }]);
  assert.equal(o2.refundDue, false);
});

test("administration : REFUND_DUE -> REFUNDED ; sinon 409 (ou 404 si inconnue)", async () => {
  const state = { paymentStatus: "REFUND_DUE" };
  const paymentUpdates = [];
  const db = {
    $transaction: async (fn) => fn(db),
    payment: { updateMany: async (args) => (paymentUpdates.push(args), { count: 1 }) },
    booking: {
      updateMany: async ({ where, data }) => (where.paymentStatus === state.paymentStatus ? (Object.assign(state, data), { count: 1 }) : { count: 0 }),
      findUnique: async ({ where }) => (where.id === "bk1" ? { id: "bk1", ...state } : null),
    },
  };
  assert.equal((await payments.markRefunded("bk1", db)).paymentStatus, "REFUNDED");
  // Paiements acceptés de la réservation marqués remboursés dans la même transaction.
  assert.deepEqual(paymentUpdates, [{ where: { bookingId: "bk1", status: "ACCEPTED" }, data: { status: "REFUNDED" } }]);
  await rejects(payments.markRefunded("bk1", db), 409);
  await rejects(payments.markRefunded("absent", db), 404);
});

// --- Routes HTTP ---------------------------------------------------------------------------------

async function withServer(router, fn) {
  const app = express();
  app.use((req, res, next) => {
    req.log = { info() {}, warn() {}, error() {}, debug() {} };
    next();
  });
  app.use(express.json());
  app.use("/api", router);
  app.use((req, res) => res.status(404).json({ error: "Route introuvable" }));
  app.use(errorHandler);
  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

test("paiements désactivés : config { enabled: false }, toutes les autres routes 404, aucun accès base", async () => {
  const touched = [];
  const db = new Proxy({}, { get: (_, k) => (touched.push(k), undefined) });
  const router = createPaymentsRouter({ settings: { ...settings, enabled: false }, db, provider: null });
  await withServer(router, async (base) => {
    const cfg = await fetch(`${base}/api/payments/config`);
    assert.equal(cfg.status, 200);
    assert.deepEqual(await cfg.json(), { enabled: false, provider: null, currency: "XOF" });
    for (const [method, path] of [
      ["POST", "/api/bookings/bk1/payments"],
      ["POST", `/api/guest-bookings/${"g".repeat(43)}/payments`],
      ["GET", `/api/payments/${TX}/status`],
      ["POST", "/api/payments/cinetpay/notify"],
      ["GET", "/api/payments/return"],
      ["GET", `/api/payments/fake/${TX}`],
    ]) {
      assert.equal((await fetch(`${base}${path}`, { method })).status, 404, `${method} ${path}`);
    }
  });
  assert.deepEqual(touched, []);
});

test("route notify : x-token invalide -> 401 sans traitement ; valide -> 200 puis vérification /check", async () => {
  const mem = memoryDb({ payments: [pendingPayment()] });
  const { provider, calls } = fakeCinetPay({ "/payment/check": checkResponse("ACCEPTED") });
  const router = createPaymentsRouter({ settings, provider, db: mem.db, appUrl: "https://app.example" });
  await withServer(router, async (base) => {
    const post = (body, token) =>
      fetch(`${base}/api/payments/cinetpay/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...(token ? { "x-token": token } : {}) },
        body: new URLSearchParams(body).toString(),
      });
    assert.equal((await fetch(`${base}/api/payments/cinetpay/notify`)).status, 200);
    assert.equal((await post(notification)).status, 401);
    assert.equal((await post(notification, "0".repeat(64))).status, 401);
    // Jeton calculé sur un autre montant : rejeté.
    assert.equal((await post(notification, computeCinetPayToken({ ...notification, cpm_amount: "1" }, SECRET))).status, 401);
    assert.equal(calls.length, 0);
    assert.equal(mem.payment().status, "PENDING");

    // 200 seulement après traitement : la réservation est déjà payée à la réponse.
    const ok = await post(notification, computeCinetPayToken(notification, SECRET));
    assert.equal(ok.status, 200);
    assert.equal(mem.booking().paymentStatus, "PAID");
    assert.deepEqual(calls.map((c) => c.path), ["/payment/check"]);
  });
});

test("route notify : vérification /check en échec -> 503 (CinetPay renverra la notification), paiement inchangé", async () => {
  const mem = memoryDb({ payments: [pendingPayment()] });
  const provider = createCinetPayProvider({
    apiKey: "k",
    siteId: SITE_ID,
    secretKey: SECRET,
    baseUrl: "https://cinetpay.test/v2",
    fetchImpl: async () => {
      throw new Error("ETIMEDOUT");
    },
  });
  const router = createPaymentsRouter({ settings, provider, db: mem.db, appUrl: "https://app.example" });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/api/payments/cinetpay/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "x-token": computeCinetPayToken(notification, SECRET) },
      body: new URLSearchParams(notification).toString(),
    });
    assert.equal(res.status, 503);
    assert.equal(mem.payment().status, "PENDING");
    assert.equal(mem.booking().paymentStatus, "UNPAID");
  });
});

test("administration : paiement isolé (doublon, montant discordant) REFUND_DUE -> REFUNDED ; sinon 409 / 404", async () => {
  const p = { id: "p1", status: "REFUND_DUE", transactionId: TX };
  const db = {
    payment: {
      updateMany: async ({ where, data }) => (where.id === p.id && where.status === p.status ? (Object.assign(p, data), { count: 1 }) : { count: 0 }),
      findUnique: async ({ where }) => (where.id === "p1" ? { ...p, amount: "100" } : null),
    },
  };
  assert.equal((await payments.markPaymentRefunded("p1", db)).status, "REFUNDED");
  await rejects(payments.markPaymentRefunded("p1", db), 409);
  await rejects(payments.markPaymentRefunded("absent", db), 404);
});

test("journaux : x-token et identifiants de transaction masqués", async () => {
  const { maskSensitiveUrl, redactPaths } = await import("../src/config/logger.js");
  assert.ok(redactPaths.includes('req.headers["x-token"]'));
  assert.equal(maskSensitiveUrl(`/api/payments/${TX}/status`), "/api/payments/[masqué]/status");
  assert.equal(maskSensitiveUrl(`/api/payments/return?tx=${TX}`), "/api/payments/return?tx=[masqué]");
  assert.equal(maskSensitiveUrl(`/api/payments/return?a=1&tx=${TX}&b=2`), "/api/payments/return?a=1&tx=[masqué]&b=2");
  assert.equal(maskSensitiveUrl(`/api/payments/fake/${TX}/simulate`), "/api/payments/fake/[masqué]/simulate");
  assert.equal(maskSensitiveUrl("/api/payments/config"), "/api/payments/config");
});

test("errorHandler : message 5xx public seulement si expose: true", async () => {
  const { errorHandler: handler } = await import("../src/middleware/errorHandler.js");
  const run = (err) => {
    const res = {
      headersSent: false,
      code: 0,
      body: null,
      status(c) {
        this.code = c;
        return this;
      },
      json(b) {
        this.body = b;
        return this;
      },
    };
    handler(err, { method: "POST", originalUrl: "/x", id: "r1", log: { error() {} } }, res, () => {});
    return res;
  };
  const exposed = run(Object.assign(new Error("Le service de paiement est momentanément indisponible, réessayez"), { statusCode: 502, expose: true }));
  assert.equal(exposed.code, 502);
  assert.equal(exposed.body.error, "Le service de paiement est momentanément indisponible, réessayez");
  const hidden = run(Object.assign(new Error("secret interne"), { statusCode: 502 }));
  assert.equal(hidden.body.error, "Erreur serveur");
});

test("route return : redirection 303 vers la page de retour du frontend, sans traitement", async () => {
  const mem = memoryDb({ payments: [pendingPayment()] });
  const { provider, calls } = fakeCinetPay({});
  const router = createPaymentsRouter({ settings, provider, db: mem.db, appUrl: "https://app.example" });
  await withServer(router, async (base) => {
    const get = await fetch(`${base}/api/payments/return?tx=${TX}`, { redirect: "manual" });
    assert.equal(get.status, 303);
    assert.equal(get.headers.get("location"), `https://app.example/paiement/retour?tx=${TX}`);
    const post = await fetch(`${base}/api/payments/return?tx=${TX}`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "token=abc&transaction_id=x",
    });
    assert.equal(post.status, 303);
    const evil = await fetch(`${base}/api/payments/return?tx=https://evil.example`, { redirect: "manual" });
    assert.equal(evil.headers.get("location"), "https://app.example/paiement/retour");
  });
  assert.equal(calls.length, 0);
  assert.equal(mem.payment().status, "PENDING");
});

test("fournisseur simulé : page de paiement, « accepté » -> même traitement que la notification -> PAID", async () => {
  const mem = memoryDb({ payments: [pendingPayment({ provider: "fake", paymentUrl: `http://localhost:3000/api/payments/fake/${TX}` })] });
  const provider = createFakeProvider({ apiUrl: "http://localhost:3000" });
  const router = createPaymentsRouter({ settings: { ...settings, provider: "fake" }, provider, db: mem.db, appUrl: "http://localhost:3000" });
  await withServer(router, async (base) => {
    const page = await fetch(`${base}/api/payments/fake/${TX}`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Simuler un paiement accepté/);
    assert.match(html, /Simuler un paiement refusé/);
    assert.match(page.headers.get("content-security-policy"), /form-action 'self' http:\/\/localhost:3000/);

    const status = await (await fetch(`${base}/api/payments/${TX}/status`)).json();
    assert.equal(status.status, "PENDING");
    assert.equal(status.booking.paymentStatus, "UNPAID");

    const sim = await fetch(`${base}/api/payments/fake/${TX}/simulate`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "outcome=accepted",
    });
    assert.equal(sim.status, 303);
    assert.equal(sim.headers.get("location"), `http://localhost:3000/paiement/retour?tx=${TX}`);
    assert.equal(mem.booking().paymentStatus, "PAID");
    assert.equal(mem.payment().status, "ACCEPTED");
    const after = await (await fetch(`${base}/api/payments/${TX}/status`)).json();
    assert.equal(after.status, "ACCEPTED");
    assert.equal(after.booking.paymentStatus, "PAID");
    // Vue publique : ni lien de paiement ni identifiant de réservation.
    assert.equal("paymentUrl" in after, false);
    assert.equal("id" in after.booking, false);
    assert.equal("paymentUrl" in status, false);
    assert.equal((await fetch(`${base}/api/payments/AFB00/status`)).status, 404);
  });
});

test("page de retour : paiement en attente -> nouvelle vérification auprès du prestataire, limitée dans le temps", async () => {
  // Transaction propre à ce test (la limite de fréquence est mémorisée par transaction).
  const TX = `AFB${"F".repeat(32)}`;
  const mem = memoryDb({ payments: [pendingPayment({ transactionId: TX })] });
  const { provider, calls } = fakeCinetPay({ "/payment/check": checkResponse("WAITING_FOR_CUSTOMER") });
  const now = new Date();
  const first = await payments.getPaymentStatus({ transactionId: TX }, { db: mem.db, provider, settings, now });
  assert.equal(first.view.status, "PENDING");
  assert.equal(first.sync.outcome, "pending");
  assert.equal(mem.payment().rawStatus, "WAITING_FOR_CUSTOMER");
  const second = await payments.getPaymentStatus({ transactionId: TX }, { db: mem.db, provider, settings, now: new Date(now.getTime() + 2000) });
  assert.equal(second.sync, null);
  assert.equal(calls.length, 1);
});

// --- Configuration au démarrage ----------------------------------------------------------------

const backendDir = fileURLToPath(new URL("..", import.meta.url));
function startConfig(env) {
  const base = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    DATABASE_URL: "postgresql://t:t@localhost:5432/t",
    DIRECT_URL: "postgresql://t:t@localhost:5432/t",
    JWT_SECRET: "secret-de-test-suffisamment-long-pour-hs256-0123456789",
    APP_URL: "https://app.example",
    STORAGE_DRIVER: "local",
    STORAGE_ALLOW_LOCAL: "1",
    EMAIL_DRIVER: "console",
    CORS_ORIGIN: "https://app.example",
    PAYMENTS_ENABLED: "",
    PAYMENT_PROVIDER: "",
    CINETPAY_API_KEY: "",
    CINETPAY_SITE_ID: "",
    CINETPAY_SECRET_KEY: "",
    API_PUBLIC_URL: "",
    PAYMENT_DUE_MINUTES_INSTANT: "",
    PAYMENT_DUE_HOURS_REQUEST: "",
  };
  try {
    const out = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", "const { config } = await import('./src/config/env.js'); console.log(JSON.stringify(config.payments));"],
      { cwd: backendDir, env: { ...base, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    return { ok: true, payments: JSON.parse(out.trim().split("\n").pop()) };
  } catch (err) {
    return { ok: false, stderr: String(err.stderr) };
  }
}

test("config : désactivé par défaut ; fake refusé en production ; cinetpay sans clés refusé", () => {
  const def = startConfig({ NODE_ENV: "production" });
  assert.equal(def.ok, true);
  assert.equal(def.payments.enabled, false);
  assert.equal(def.payments.provider, null);

  const fake = startConfig({ NODE_ENV: "production", PAYMENTS_ENABLED: "true", PAYMENT_PROVIDER: "fake" });
  assert.equal(fake.ok, false);
  assert.match(fake.stderr, /PAYMENT_PROVIDER=fake .*refusé en production/);
  assert.equal(startConfig({ NODE_ENV: "development", PAYMENTS_ENABLED: "true", PAYMENT_PROVIDER: "fake" }).ok, true);

  const noKeys = startConfig({ NODE_ENV: "production", PAYMENTS_ENABLED: "true", PAYMENT_PROVIDER: "cinetpay" });
  assert.equal(noKeys.ok, false);
  assert.match(noKeys.stderr, /CINETPAY_API_KEY, CINETPAY_SITE_ID, CINETPAY_SECRET_KEY/);

  const ok = startConfig({
    NODE_ENV: "production",
    PAYMENTS_ENABLED: "true",
    PAYMENT_PROVIDER: "cinetpay",
    CINETPAY_API_KEY: "k",
    CINETPAY_SITE_ID: "1",
    CINETPAY_SECRET_KEY: "s",
    PAYMENT_DUE_MINUTES_INSTANT: "45",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.payments.apiUrl, "https://app.example");
  assert.equal(ok.payments.dueMinutesInstant, 45);
  assert.equal(startConfig({ PAYMENTS_ENABLED: "oui" }).ok, false);
  assert.equal(startConfig({ PAYMENT_DUE_HOURS_REQUEST: "0" }).ok, false);
});

// --- E-mails -------------------------------------------------------------------------------------

test("e-mails : échéance et montant exact, remboursement en cours, annulation faute de paiement", async () => {
  const t = await import("../src/services/email/templates.js");
  const booking = {
    listingTitle: "Villa <b>Lomé</b>",
    checkIn: day(10),
    checkOut: day(12),
    nights: 2,
    guests: 2,
    totalPrice: 20001,
    currency: "XOF",
    paymentStatus: "UNPAID",
    paymentDueAt: new Date("2026-11-01T14:30:00Z"),
    paymentAmount: 20005,
  };
  const confirmed = t.bookingConfirmedGuestEmail({ name: "Ama", booking, url: "https://app.example/profil" });
  assert.match(confirmed.text, /Paiement Mobile Money à effectuer avant le 1 novembre 2026 à 14:30 \(GMT\)/);
  assert.match(confirmed.text.replace(/\s/g, " "), /20 005/);
  assert.doesNotMatch(confirmed.html, /<b>Lomé/);
  // Paiements désactivés (NONE) : e-mail inchangé.
  assert.doesNotMatch(t.bookingConfirmedGuestEmail({ name: "Ama", booking: { ...booking, paymentStatus: "NONE" } }).text, /Paiement/);

  const cancelled = t.bookingCancelledEmail({ name: "Ama", recipient: "guest", cancelledBy: "guest", booking, refundDue: true });
  assert.match(cancelled.text, /remboursement en cours de traitement/);
  assert.doesNotMatch(t.bookingCancelledEmail({ name: "Ama", recipient: "guest", cancelledBy: "guest", booking }).text, /rembours/);

  const unpaid = t.bookingUnpaidCancelledEmail({ name: "Kofi", recipient: "host", booking });
  assert.match(unpaid.subject, /paiement non reçu/);
  assert.match(t.adminPaymentAlertEmail({ reason: "duplicate", booking, transactionId: TX, amount: 20005 }).text, new RegExp(TX));
});
