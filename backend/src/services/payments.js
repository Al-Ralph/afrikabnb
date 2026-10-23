// Paiement des réservations (Mobile Money via CinetPay, ou fournisseur simulé `fake`).
// Sans req/res : erreurs métier via httpError. Dépendances injectables (tests) :
// deps = { db (client Prisma), provider (voir services/paymentProviders), settings (config.payments),
//          now, onSync (résultat de chaque vérification auprès du prestataire : e-mails, alertes) }.
//
// Machine d'états :
// - Booking.paymentStatus : NONE -> UNPAID (confirmation, échéance paymentDueAt) -> PAID ;
//   UNPAID à l'échéance -> réservation exposée CANCELLED (dates libérées), annulée en base par le
//   balayage (services/bookings.js, sweepUnpaid) après le délai de grâce et une dernière vérification ;
//   PAID + annulation -> REFUND_DUE -> REFUNDED (marqué par l'administrateur, remboursement hors appli) ;
//   paiement accepté sur une réservation annulée / échue -> REFUND_DUE (jamais réactivée).
// - Payment.status : PENDING -> ACCEPTED | REFUSED ; FAILED si l'initialisation échoue ;
//   REFUND_DUE -> REFUNDED pour un paiement encaissé à rembourser isolément (doublon sur une réservation
//   déjà payée, montant / devise discordants). Un paiement REFUSED laisse la réservation payable.
// Le statut n'est jamais déduit de la notification ni du retour navigateur : toujours confirmé par
// l'API de vérification du prestataire (checkPayment), puis appliqué sous transaction avec verrous.
// Aucun appel réseau n'est fait dans une transaction.
import { Prisma } from "@prisma/client";
import prisma from "../config/db.js";
import { config } from "../config/env.js";
import { httpError } from "../utils/httpError.js";
import { effectiveStatus, findStayConflict } from "../utils/bookingStatus.js";
import {
  MAX_PAYMENTS_PER_BOOKING,
  PAYMENT_CURRENCY,
  PAYMENT_GRACE_MS,
  PAYMENT_REUSE_MS,
  generateTransactionId,
  isPaymentOverdue,
  isTransactionIdFormat,
  payableAmount,
} from "../utils/payment.js";
import { createPaymentProvider } from "./paymentProviders/index.js";
import { findByGuestToken, overlapping } from "./bookings.js";

// Paiement PENDING sans lien (initialisation en cours chez le prestataire) : pas de second paiement.
export const PAYMENT_INIT_WINDOW_MS = 30 * 1000;
// Statuts définitifs d'un paiement : plus aucune vérification ni mise à jour par le prestataire.
const FINAL_PAYMENT_STATUSES = ["ACCEPTED", "REFUND_DUE", "REFUNDED"];

let defaultProvider;
// Fournisseur partagé du processus (le fournisseur simulé garde ses transactions en mémoire).
export function getPaymentProvider() {
  if (defaultProvider === undefined) defaultProvider = createPaymentProvider(config.payments);
  return defaultProvider;
}

function resolve(deps = {}) {
  const settings = deps.settings ?? config.payments;
  return {
    db: deps.db ?? prisma,
    settings,
    provider: deps.provider !== undefined ? deps.provider : getPaymentProvider(),
    now: deps.now ?? new Date(),
    onSync: deps.onSync,
  };
}

// Configuration publique (GET /api/payments/config).
export function publicPaymentConfig(settings = config.payments) {
  return settings.enabled
    ? { enabled: true, provider: settings.provider, currency: PAYMENT_CURRENCY }
    : { enabled: false, provider: null, currency: PAYMENT_CURRENCY };
}

const notFound = () => httpError(404, "Réservation introuvable");

// Vue d'un paiement. publicView (GET /status, sans authentification) : ni identifiant de réservation
// ni lien de paiement.
function paymentView(payment, booking, now = new Date(), { publicView = false } = {}) {
  const out = {
    transactionId: payment.transactionId,
    status: payment.status,
    amount: Number(payment.amount),
    currency: payment.currency,
    paidAt: payment.paidAt ?? null,
  };
  if (!publicView) out.paymentUrl = payment.status === "PENDING" ? payment.paymentUrl : null;
  if (booking) {
    out.booking = {
      status: effectiveStatus(booking, now),
      paymentStatus: booking.paymentStatus,
      paymentDueAt: booking.paymentDueAt ?? null,
      paidAt: booking.paidAt ?? null,
    };
    if (!publicView) out.booking.id = booking.id;
  }
  return out;
}

// Vérifie une transaction et transmet le résultat à onSync ; erreurs prestataire -> { outcome: "error" }.
async function syncQuietly(transactionId, resolved) {
  try {
    const result = await syncPayment({ transactionId }, resolved);
    resolved.onSync?.(result);
    return result;
  } catch (error) {
    const result = { outcome: "error", transactionId, error };
    resolved.onSync?.(result);
    return result;
  }
}

// Lance (ou reprend) le paiement d'une réservation. Accès : voyageur connecté propriétaire
// (`user`) ou voyageur sans compte (`guestToken`). -> paymentView (+ reused).
// Paiement déjà en cours : vérifié auprès du prestataire avant toute nouvelle tentative (accepté ->
// appliqué ; en attente et récent -> même lien ; prestataire injoignable -> pas de nouveau paiement).
export async function startPayment({ bookingId, user, guestToken, lang }, deps) {
  const resolved = resolve(deps);
  const { db, settings, provider, now } = resolved;
  if (!settings.enabled || !provider) throw httpError(404, "Route introuvable");

  let id;
  if (guestToken !== undefined) {
    id = (await findByGuestToken(guestToken, null, db)).id;
  } else {
    const found = await db.booking.findUnique({ where: { id: bookingId }, select: { id: true, guestId: true } });
    // Même réponse qu'une réservation inexistante : aucune information sur les réservations d'autrui.
    if (!found || !user || found.guestId == null || found.guestId !== user.id) throw notFound();
    id = found.id;
  }

  // Hors transaction (appel réseau) : dernier paiement en cours avec lien.
  const inFlight = await db.payment.findFirst({
    where: { bookingId: id, provider: provider.name, status: "PENDING", paymentUrl: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  let checkFailed = false;
  if (inFlight) {
    const result = await syncQuietly(inFlight.transactionId, resolved);
    checkFailed = result.outcome === "error";
    if (checkFailed && now.getTime() - new Date(inFlight.createdAt).getTime() >= PAYMENT_REUSE_MS) {
      // Statut inconnu d'un ancien paiement : pas de nouveau paiement (risque de double débit).
      throw unavailable();
    }
  }

  const prepared = await db.$transaction(async (tx) => {
    // Verrou de la réservation : deux clics simultanés ne créent pas deux paiements.
    const rows = await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${id} FOR UPDATE`;
    if (!rows.length) throw notFound();
    const booking = await tx.booking.findUnique({
      where: { id },
      include: { listing: { select: { currency: true } } },
    });
    if (booking.paymentStatus === "PAID") throw httpError(409, "Cette réservation est déjà payée");
    if (effectiveStatus(booking, now) !== "CONFIRMED" || booking.paymentStatus !== "UNPAID") {
      throw httpError(409, "Cette réservation n'est pas payable (non confirmée, annulée ou délai de paiement dépassé)");
    }
    if ((booking.listing?.currency || PAYMENT_CURRENCY) !== PAYMENT_CURRENCY) {
      throw httpError(409, "Devise non prise en charge par le paiement en ligne");
    }
    const amount = payableAmount(booking.totalPrice);
    if (amount <= 0) throw httpError(409, "Montant à payer invalide");

    const latest = await tx.payment.findFirst({
      where: { bookingId: id, provider: provider.name, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    if (latest) {
      const age = now.getTime() - new Date(latest.createdAt).getTime();
      if (latest.paymentUrl == null && age < PAYMENT_INIT_WINDOW_MS) {
        throw httpError(409, "Paiement en cours d'initialisation, réessayez dans quelques secondes");
      }
      // Encore en attente chez le prestataire (vérifié ci-dessus) et récent : même lien.
      if (latest.paymentUrl != null && age < PAYMENT_REUSE_MS && Number(latest.amount) === amount) {
        return { payment: latest, booking, reused: true };
      }
      if (latest.paymentUrl != null && checkFailed) throw unavailable();
    }

    const attempts = await tx.payment.count({ where: { bookingId: id } });
    if (attempts >= MAX_PAYMENTS_PER_BOOKING) {
      throw httpError(429, "Trop de tentatives de paiement pour cette réservation : contactez le support");
    }
    const payment = await tx.payment.create({
      data: {
        bookingId: id,
        provider: provider.name,
        transactionId: generateTransactionId(),
        amount: new Prisma.Decimal(amount),
        currency: PAYMENT_CURRENCY,
        status: "PENDING",
      },
    });
    return { payment, booking, reused: false };
  });

  if (prepared.reused) return { ...paymentView(prepared.payment, prepared.booking, now), reused: true };

  const { payment, booking } = prepared;
  let init;
  try {
    init = await provider.initPayment({
      transactionId: payment.transactionId,
      amount: Number(payment.amount),
      currency: payment.currency,
      // CinetPay : pas de caractères spéciaux (# / $ _ &) dans la description.
      description: `Reservation AfrikaBnB ${booking.id.replace(/[^A-Za-z0-9]/g, "").slice(-10)}`,
      notifyUrl: `${settings.apiUrl}/api/payments/cinetpay/notify`,
      returnUrl: `${settings.apiUrl}/api/payments/return?tx=${payment.transactionId}`,
      lang,
      metadata: booking.id,
    });
  } catch (err) {
    await db.payment
      .update({ where: { id: payment.id }, data: { status: "FAILED", rawStatus: "INIT_ERROR" } })
      .catch(() => {});
    throw Object.assign(unavailable(), { providerError: { message: err.message, details: err.details } });
  }
  const updated = await db.payment.update({
    where: { id: payment.id },
    data: { paymentUrl: init.paymentUrl, providerRef: init.providerRef ?? null },
  });
  return { ...paymentView(updated, booking, now), reused: false };
}

// 502 au message volontairement public (errorHandler : expose).
function unavailable() {
  return Object.assign(httpError(502, "Le service de paiement est momentanément indisponible, réessayez"), {
    expose: true,
  });
}

// Vérifie une transaction auprès du prestataire et applique le résultat (notification, page de
// retour, balayage, réconciliation, simulation). `siteId` : valeur reçue dans la notification
// (cpm_site_id), comparée à la nôtre.
// -> { outcome, bookingId?, transactionId, amount?, cancelledNow?, firstDetection? } ; outcome :
//   "unknown" | "site_mismatch" | "already_final" | "mismatch" | "pending" | "refused" | "paid"
//   | "refund_due" | "duplicate".
// Lève si le prestataire est injoignable (le paiement reste PENDING : nouvelle notification,
// réconciliation périodique ou page de retour plus tard).
export async function syncPayment({ transactionId, siteId }, deps) {
  const { db, provider, now } = resolve(deps);
  if (!provider || !isTransactionIdFormat(transactionId)) return { outcome: "unknown", transactionId };
  const payment = await db.payment.findUnique({ where: { transactionId } });
  if (!payment || payment.provider !== provider.name) return { outcome: "unknown", transactionId };
  const base = { transactionId, bookingId: payment.bookingId, amount: Number(payment.amount) };
  if (siteId !== undefined && provider.siteId && String(siteId) !== provider.siteId) return { ...base, outcome: "site_mismatch" };
  // Statut définitif : aucune nouvelle mise à jour (notifications répétées).
  if (FINAL_PAYMENT_STATUSES.includes(payment.status)) return { ...base, outcome: "already_final" };

  const check = await provider.checkPayment(transactionId);
  if (check.status === "ACCEPTED" && (Number(check.amount) !== Number(payment.amount) || check.currency !== payment.currency)) {
    // Encaissé avec un montant ou une devise inattendus : à rembourser isolément ; la réservation
    // reste payable. Alerte unique (première détection seulement).
    const { count } = await db.payment.updateMany({
      where: { id: payment.id, status: { in: ["PENDING", "REFUSED", "FAILED"] } },
      data: { status: "REFUND_DUE", rawStatus: "AMOUNT_MISMATCH", paidAt: now, method: check.method, operatorId: check.operatorId },
    });
    return {
      ...base,
      outcome: "mismatch",
      firstDetection: count === 1,
      expected: { amount: Number(payment.amount), currency: payment.currency },
      received: { amount: check.amount, currency: check.currency },
    };
  }

  return db.$transaction(async (tx) => {
    // Verrous dans le même ordre que la création / les transitions : annonce, puis réservation.
    const owner = await tx.booking.findUnique({ where: { id: payment.bookingId }, select: { listingId: true } });
    if (!owner) return { ...base, outcome: "unknown" };
    await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${owner.listingId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${payment.bookingId} FOR UPDATE`;
    const current = await tx.payment.findUnique({ where: { id: payment.id } });
    if (FINAL_PAYMENT_STATUSES.includes(current.status)) return { ...base, outcome: "already_final" };

    if (check.status === "PENDING") {
      if (current.rawStatus !== check.rawStatus) {
        await tx.payment.update({ where: { id: current.id }, data: { rawStatus: check.rawStatus } });
      }
      return { ...base, outcome: "pending" };
    }
    if (check.status === "REFUSED") {
      await tx.payment.update({ where: { id: current.id }, data: { status: "REFUSED", rawStatus: check.rawStatus } });
      return { ...base, outcome: "refused" };
    }

    // ACCEPTED (montant et devise vérifiés).
    const accepted = { rawStatus: check.rawStatus, paidAt: now, method: check.method, operatorId: check.operatorId };
    const booking = await tx.booking.findUnique({ where: { id: payment.bookingId } });
    if (booking.paymentStatus === "PAID") {
      // Second paiement d'une réservation déjà payée : ce paiement-là est à rembourser.
      await tx.payment.update({ where: { id: current.id }, data: { status: "REFUND_DUE", ...accepted } });
      return { ...base, outcome: "duplicate" };
    }
    await tx.payment.update({ where: { id: current.id }, data: { status: "ACCEPTED", ...accepted } });
    if (booking.status === "CONFIRMED" && booking.paymentStatus === "UNPAID") {
      let keep = !isPaymentOverdue(booking, now);
      if (!keep && now.getTime() - new Date(booking.paymentDueAt).getTime() <= PAYMENT_GRACE_MS) {
        // Échéance dépassée de peu (confirmation de l'opérateur tardive) : conservée si les dates
        // n'ont pas été reprises entre-temps.
        const candidates = await overlapping(tx, booking.listingId, booking.checkIn, booking.checkOut);
        keep = !findStayConflict({ checkIn: booking.checkIn, checkOut: booking.checkOut, ...candidates, excludeBookingId: booking.id, now });
      }
      if (keep) {
        await tx.booking.update({ where: { id: booking.id }, data: { paymentStatus: "PAID", paidAt: now } });
        return { ...base, outcome: "paid" };
      }
      await tx.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED", paymentStatus: "REFUND_DUE" } });
      return { ...base, outcome: "refund_due", cancelledNow: true };
    }
    // Réservation annulée, refusée, expirée, déjà remboursée… : jamais réactivée.
    await tx.booking.update({ where: { id: booking.id }, data: { paymentStatus: "REFUND_DUE" } });
    return { ...base, outcome: "refund_due" };
  });
}

// Dernière vérification auprès du prestataire par transaction (limite de fréquence de la page de retour).
const lastChecks = new Map();
export const STATUS_CHECK_INTERVAL_MS = 10 * 1000;

// Statut d'un paiement (page de retour, sans authentification : vue publique). Paiement encore en
// attente : nouvelle vérification auprès du prestataire, au plus une fois toutes les 10 s par
// transaction. -> { view, sync? }.
export async function getPaymentStatus({ transactionId }, deps) {
  const resolved = resolve(deps);
  const { db, now } = resolved;
  const notFoundPayment = () => httpError(404, "Paiement introuvable");
  if (!isTransactionIdFormat(transactionId)) throw notFoundPayment();
  let payment = await db.payment.findUnique({ where: { transactionId }, include: { booking: true } });
  if (!payment) throw notFoundPayment();
  let sync = null;
  const last = lastChecks.get(transactionId) ?? 0;
  if (payment.status === "PENDING" && payment.paymentUrl && now.getTime() - last >= STATUS_CHECK_INTERVAL_MS) {
    lastChecks.set(transactionId, now.getTime());
    if (lastChecks.size > 5000) lastChecks.delete(lastChecks.keys().next().value);
    sync = await syncPayment({ transactionId }, resolved).catch((err) => ({ outcome: "error", transactionId, error: err }));
    payment = await db.payment.findUnique({ where: { transactionId }, include: { booking: true } });
  }
  return { view: paymentView(payment, payment.booking, now, { publicView: true }), sync };
}

// Réconciliation : paiements encore PENDING (avec lien) créés il y a plus de `minAgeMs`, vérifiés
// auprès du prestataire (au plus `limit` par passage, séquentiellement, hors transaction).
// Rattrape une notification perdue ou en échec. -> résultats de syncPayment.
export async function reconcilePendingPayments({ minAgeMs = 2 * 60 * 1000, maxAgeMs = 7 * 24 * 60 * 60 * 1000, limit = 10 } = {}, deps) {
  const resolved = resolve(deps);
  const { db, provider, now } = resolved;
  if (!provider) return [];
  const pending = await db.payment.findMany({
    where: {
      provider: provider.name,
      status: "PENDING",
      paymentUrl: { not: null },
      createdAt: { lt: new Date(now.getTime() - minAgeMs), gt: new Date(now.getTime() - maxAgeMs) },
    },
    select: { transactionId: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const results = [];
  for (const p of pending) results.push(await syncQuietly(p.transactionId, resolved));
  return results;
}

// Fournisseur simulé : enregistre l'issue choisie puis la traite comme une notification.
export async function simulateFakePayment({ transactionId, outcome }, deps) {
  const resolved = resolve(deps);
  const { db, provider } = resolved;
  if (!provider || provider.name !== "fake" || config.isProduction) throw httpError(404, "Route introuvable");
  if (!isTransactionIdFormat(transactionId) || !["accepted", "refused"].includes(outcome)) {
    throw httpError(400, "Requête invalide");
  }
  const payment = await db.payment.findUnique({ where: { transactionId } });
  if (!payment || payment.provider !== "fake") throw httpError(404, "Paiement introuvable");
  provider.simulate(transactionId, outcome, { amount: Number(payment.amount), currency: payment.currency });
  return syncPayment({ transactionId }, resolved);
}

// Fournisseur simulé : données affichées par la page de paiement.
export async function getFakePayment({ transactionId }, deps) {
  const { db, provider } = resolve(deps);
  if (!provider || provider.name !== "fake" || config.isProduction) throw httpError(404, "Route introuvable");
  if (!isTransactionIdFormat(transactionId)) throw httpError(404, "Paiement introuvable");
  const payment = await db.payment.findUnique({ where: { transactionId } });
  if (!payment || payment.provider !== "fake") throw httpError(404, "Paiement introuvable");
  return payment;
}

// --- Administration : remboursements manuels ---------------------------------------------------

const paymentRefundSelect = {
  id: true,
  transactionId: true,
  amount: true,
  currency: true,
  status: true,
  method: true,
  operatorId: true,
  rawStatus: true,
  paidAt: true,
};

const refundSelect = {
  id: true,
  status: true,
  paymentStatus: true,
  paidAt: true,
  totalPrice: true,
  checkIn: true,
  checkOut: true,
  contactName: true,
  contactEmail: true,
  guest: { select: { id: true, name: true, email: true } },
  listing: { select: { id: true, title: true } },
  payments: {
    where: { status: { in: ["ACCEPTED", "REFUNDED"] } },
    select: paymentRefundSelect,
    orderBy: { paidAt: "desc" },
  },
};

// Paiements à rembourser isolément (doublon, montant discordant), avec leur réservation.
const isolatedPaymentSelect = {
  ...paymentRefundSelect,
  booking: {
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      checkIn: true,
      checkOut: true,
      contactName: true,
      contactEmail: true,
      guest: { select: { id: true, name: true, email: true } },
      listing: { select: { id: true, title: true } },
    },
  },
};

// Réservations à rembourser (REFUND_DUE) ou remboursées (REFUNDED), paginées, et paiements isolés
// dans le même état (rares : 100 au plus). -> { data, total, payments }.
export async function listRefunds({ status = "REFUND_DUE", limit, offset }, db = prisma) {
  const where = { paymentStatus: status };
  const [data, total, payments] = await Promise.all([
    db.booking.findMany({ where, select: refundSelect, orderBy: { paidAt: "desc" }, take: limit, skip: offset }),
    db.booking.count({ where }),
    db.payment.findMany({ where: { status }, select: isolatedPaymentSelect, orderBy: { paidAt: "desc" }, take: 100 }),
  ]);
  return { data, total, payments };
}

// Réservation REFUND_DUE -> REFUNDED (remboursement effectué hors application) ; ses paiements
// acceptés passent en REFUNDED. 409 sinon.
export async function markRefunded(bookingId, db = prisma) {
  const changed = await db.$transaction(async (tx) => {
    const { count } = await tx.booking.updateMany({
      where: { id: bookingId, paymentStatus: "REFUND_DUE" },
      data: { paymentStatus: "REFUNDED" },
    });
    if (count === 1) await tx.payment.updateMany({ where: { bookingId, status: "ACCEPTED" }, data: { status: "REFUNDED" } });
    return count === 1;
  });
  if (!changed) {
    const exists = await db.booking.findUnique({ where: { id: bookingId }, select: { id: true } });
    if (!exists) throw notFound();
    throw httpError(409, "Aucun remboursement en attente pour cette réservation");
  }
  return db.booking.findUnique({ where: { id: bookingId }, select: refundSelect });
}

// Paiement isolé REFUND_DUE -> REFUNDED. 409 sinon, 404 inconnu.
export async function markPaymentRefunded(paymentId, db = prisma) {
  const { count } = await db.payment.updateMany({
    where: { id: paymentId, status: "REFUND_DUE" },
    data: { status: "REFUNDED" },
  });
  if (count === 0) {
    const exists = await db.payment.findUnique({ where: { id: paymentId }, select: { id: true } });
    if (!exists) throw httpError(404, "Paiement introuvable");
    throw httpError(409, "Aucun remboursement en attente pour ce paiement");
  }
  return db.payment.findUnique({ where: { id: paymentId }, select: isolatedPaymentSelect });
}
