// Règles métier des réservations (création, disponibilités, transitions, listes).
// Sans req/res : erreurs métier levées via httpError, client Prisma injectable (`db`).
import { Prisma } from "@prisma/client";
import prisma from "../config/db.js";
import { config } from "../config/env.js";
import { listingBaseInclude } from "../api/listings/listings.serializers.js";
import { httpError } from "../utils/httpError.js";
import {
  generateGuestAccessToken,
  hashGuestAccessToken,
  isGuestAccessTokenFormat,
  isGuestAccessValid,
} from "../utils/guestAccess.js";
import { MAX_AMOUNT, addDays, computeTotalPrice, formatDay, nightsBetween, parseDay, todayDay } from "../utils/booking.js";
import {
  MAX_PENDING_PER_GUEST,
  MAX_REQUEST_NIGHTS,
  activePendingWhere,
  blockingBookingWhere,
  expiredPendingWhere,
  findStayConflict,
  nextStatus,
  overdueUnpaidWhere,
} from "../utils/bookingStatus.js";
import { PAYMENT_GRACE_MS, paymentDueDate } from "../utils/payment.js";

export const publicPerson = { select: { id: true, name: true, avatar: true } };

// Vue voyageur : annonce complète + présence d'un avis.
export const guestBookingInclude = {
  listing: { include: listingBaseInclude },
  review: { select: { id: true } },
};

// Vue hôte : voyageur (sans e-mail de compte) + résumé de l'annonce. La fiche de contact (colonnes
// scalaires) n'est exposée que par la sérialisation hôte (bookingWithContactToJson).
export const hostBookingInclude = {
  guest: publicPerson,
  listing: {
    select: { id: true, title: true, location: true, imageUrl: true, currency: true, instantBook: true },
  },
};

// Persistance paresseuse des demandes expirées (voir utils/bookingStatus.js).
export function sweepExpired(where, db = prisma) {
  return db.booking.updateMany({ where: { ...where, ...expiredPendingWhere() }, data: { status: "EXPIRED" } });
}

// Paiements actifs : une réservation CONFIRMED non payée à son échéance est annulée en base.
// - Seulement après le délai de grâce (paymentDueAt <= now - PAYMENT_GRACE_MS), le même que celui
//   accordé à un paiement accepté tardivement (services/payments.js, syncPayment) ; les dates sont,
//   elles, libérées dès l'échéance (utils/bookingStatus.js).
// - Avant d'annuler une réservation ayant un paiement PENDING (avec lien), le paiement est vérifié
//   auprès du prestataire (hors transaction, au plus `maxChecks` appels par balayage). Prestataire
//   injoignable, ou plafond d'appels atteint : la réservation n'est PAS annulée (nouvel essai au
//   prochain balayage) ; un paiement accepté est appliqué par syncPayment.
// - Annulation conditionnelle ligne par ligne : un seul appelant concurrent effectue la transition.
// paymentDeps : dépendances de services/payments.js (provider, onSync…).
// -> identifiants effectivement annulés faute de paiement (e-mails envoyés par l'appelant).
export async function sweepUnpaid(where, db = prisma, now = new Date(), { maxChecks = 3, ...paymentDeps } = {}) {
  if (!config.payments.enabled) return [];
  const overdue = overdueUnpaidWhere(new Date(now.getTime() - PAYMENT_GRACE_MS));
  const candidates = await db.booking.findMany({ where: { ...where, ...overdue }, select: { id: true }, take: 50 });
  if (candidates.length === 0) return [];
  const pending = await db.payment.findMany({
    where: { bookingId: { in: candidates.map((c) => c.id) }, status: "PENDING", paymentUrl: { not: null } },
    select: { bookingId: true, transactionId: true },
  });
  const keep = new Set();
  if (pending.length) {
    // Import différé : services/payments.js importe ce module.
    const { syncPayment } = await import("./payments.js");
    let checks = 0;
    for (const p of pending) {
      if (keep.has(p.bookingId)) continue;
      if (checks >= maxChecks) {
        keep.add(p.bookingId);
        continue;
      }
      checks += 1;
      try {
        const result = await syncPayment({ transactionId: p.transactionId }, { ...paymentDeps, db, now });
        paymentDeps.onSync?.(result);
      } catch (error) {
        paymentDeps.onSync?.({ outcome: "error", transactionId: p.transactionId, error });
        keep.add(p.bookingId);
      }
    }
  }
  const cancelled = [];
  for (const { id } of candidates) {
    if (keep.has(id)) continue;
    const { count } = await db.booking.updateMany({ where: { id, ...overdue }, data: { status: "CANCELLED" } });
    if (count === 1) cancelled.push(id);
  }
  return cancelled;
}

// Réservations et périodes bloquées qui pourraient chevaucher [start, end[ (à affiner par findStayConflict).
export async function overlapping(tx, listingId, start, end) {
  const [bookings, blockedPeriods] = await Promise.all([
    tx.booking.findMany({
      where: { listingId, status: { in: ["PENDING", "CONFIRMED"] }, checkIn: { lt: end }, checkOut: { gt: start } },
      select: {
        id: true,
        status: true,
        createdAt: true,
        checkIn: true,
        checkOut: true,
        // Paiements actifs : échéance de paiement (une réservation impayée à l'échéance ne bloque plus).
        ...(config.payments.enabled ? { paymentStatus: true, paymentDueAt: true } : {}),
      },
    }),
    tx.blockedPeriod.findMany({
      where: { listingId, startDate: { lt: end }, endDate: { gt: start } },
      select: { id: true, startDate: true, endDate: true },
    }),
  ]);
  return { bookings, blockedPeriods };
}

// Colonnes de la fiche de contact à partir du contact validé (contactSchema).
export function contactData(contact) {
  return {
    contactName: contact.name,
    contactEmail: contact.email.toLowerCase(),
    contactPhone: contact.phone,
    contactCountry: contact.country.toUpperCase(),
    arrivalTime: contact.arrivalTime ?? null,
    messageToHost: contact.message ?? null,
  };
}

// Création d'une réservation, connectée (`user` = { id }) ou sans compte (`user` null).
// - Connecté : réservation instantanée (instantBook) -> CONFIRMED ; sinon demande PENDING à valider
//   par l'hôte (quota de demandes en attente par compte).
// - Sans compte : toujours PENDING, même si instantBook (un inconnu ne bloque pas un calendrier sans
//   contrôle de l'hôte) ; quota de demandes en attente par adresse e-mail (verrou consultatif) ;
//   jeton d'accès généré (seul son hash est stocké).
// Retourne { booking (include guestBookingInclude), accessToken (sans compte uniquement, sinon null) }.
export async function createBooking({ listingId, user, checkIn, checkOut, guests, contact }, db = prisma) {
  const nights = nightsBetween(checkIn, checkOut);
  const start = parseDay(checkIn);
  const end = parseDay(checkOut);
  const anonymous = !user;
  const fields = contactData(contact);

  return db.$transaction(async (tx) => {
    // Verrou de la ligne Listing : deux réservations concurrentes de la même annonce sont
    // sérialisées, le contrôle de chevauchement ci-dessous ne peut donc pas être contourné.
    const rows = await tx.$queryRaw`
      SELECT "id", "hostId", "pricePerNight", "maxGuests", "instantBook", "status"::text AS "status"
      FROM "Listing" WHERE "id" = ${listingId} FOR UPDATE`;
    const listing = rows[0];
    if (!listing || listing.status !== "ACTIVE") throw httpError(404, "Annonce introuvable");
    if (!anonymous && listing.hostId === user.id) {
      throw httpError(403, "Impossible de réserver sa propre annonce");
    }
    if (guests > Number(listing.maxGuests)) {
      throw httpError(400, `Capacité maximale dépassée (${listing.maxGuests} voyageurs)`);
    }
    const status = !anonymous && listing.instantBook ? "CONFIRMED" : "PENDING";
    if (status === "PENDING") {
      if (nights > MAX_REQUEST_NIGHTS) {
        throw httpError(
          400,
          anonymous
            ? `Une demande est limitée à ${MAX_REQUEST_NIGHTS} nuits`
            : `Une demande est limitée à ${MAX_REQUEST_NIGHTS} nuits (réservation instantanée non disponible pour cette annonce)`
        );
      }
      let pending;
      if (anonymous) {
        // Verrou consultatif (libéré en fin de transaction) sur l'adresse : deux demandes simultanées
        // de la même adresse ne dépassent pas le quota. $executeRaw : pg_advisory_xact_lock renvoie void.
        const lockKey = `booking-contact:${fields.contactEmail}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        pending = await tx.booking.count({ where: { contactEmail: fields.contactEmail, ...activePendingWhere() } });
      } else {
        // Verrou du voyageur : deux demandes simultanées ne peuvent pas dépasser le quota.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
        pending = await tx.booking.count({ where: { guestId: user.id, ...activePendingWhere() } });
      }
      if (pending >= MAX_PENDING_PER_GUEST) {
        throw httpError(429, "Trop de demandes en attente : attendez la réponse des hôtes");
      }
    }
    const totalPrice = computeTotalPrice(listing.pricePerNight, nights);
    if (totalPrice > MAX_AMOUNT) throw httpError(400, "Montant total trop élevé");

    const candidates = await overlapping(tx, listingId, start, end);
    if (findStayConflict({ checkIn, checkOut, ...candidates })) {
      throw httpError(409, "Ces dates ne sont pas disponibles");
    }

    const access = anonymous ? generateGuestAccessToken(checkOut) : null;
    // Paiements actifs : une réservation instantanée confirmée est à payer sous peu (dates bloquées
    // jusqu'à l'échéance).
    const payment =
      status === "CONFIRMED" && config.payments.enabled
        ? { paymentStatus: "UNPAID", paymentDueAt: paymentDueDate("instant", config.payments) }
        : {};
    const booking = await tx.booking.create({
      data: {
        listingId,
        guestId: anonymous ? null : user.id,
        checkIn: start,
        checkOut: end,
        guests,
        totalPrice: new Prisma.Decimal(totalPrice.toFixed(2)),
        status,
        ...fields,
        guestAccessTokenHash: access?.tokenHash ?? null,
        guestAccessExpiresAt: access?.expiresAt ?? null,
        ...payment,
      },
      include: guestBookingInclude,
    });
    return { booking, accessToken: access?.token ?? null };
  });
}

// Nuits indisponibles, sans information personnelle.
// `booked` : réservations bloquantes ET périodes bloquées par l'hôte (compatibilité : un calendrier
// qui ne lit que `booked` désactive toutes les nuits indisponibles) ; `blocked` : blocages seuls.
export async function getAvailability({ listingId, from, to }, db = prisma) {
  from = from ?? todayDay();
  to = to ?? addDays(from, 365);
  if (to <= from) throw httpError(400, "`to` doit être postérieur à `from`");
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true, status: true },
  });
  if (!listing || listing.status !== "ACTIVE") throw httpError(404, "Annonce introuvable");
  const [bookings, blocked] = await Promise.all([
    db.booking.findMany({
      where: {
        listingId: listing.id,
        ...blockingBookingWhere(),
        checkIn: { lt: parseDay(to) },
        checkOut: { gt: parseDay(from) },
      },
      select: { checkIn: true, checkOut: true },
    }),
    db.blockedPeriod.findMany({
      where: { listingId: listing.id, startDate: { lt: parseDay(to) }, endDate: { gt: parseDay(from) } },
      select: { startDate: true, endDate: true },
    }),
  ]);
  const blockedRanges = blocked.map((p) => ({ checkIn: formatDay(p.startDate), checkOut: formatDay(p.endDate) }));
  const booked = [
    ...bookings.map((b) => ({ checkIn: formatDay(b.checkIn), checkOut: formatDay(b.checkOut) })),
    ...blockedRanges,
  ].sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0));
  return {
    listingId: listing.id,
    from,
    to,
    booked,
    blocked: blockedRanges.map((r) => ({ startDate: r.checkIn, endDate: r.checkOut })),
  };
}

// Applique une transition (cancel / confirm / decline) dans une transaction.
// allowed(booking, user) -> message d'erreur 403 ou null. `user` null : voyageur sans compte,
// authentifié par son jeton d'accès (voir cancelGuestBooking).
// Retourne { booking (rechargée pour la réponse), changed, by: "guest" | "host" }.
async function transition(bookingId, user, action, allowed, db) {
  const outcome = await db.$transaction(async (tx) => {
    const found = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { listing: { select: { hostId: true, status: true } } },
    });
    if (!found) throw httpError(404, "Réservation introuvable");
    const forbidden = allowed(found, user);
    if (forbidden) throw httpError(403, forbidden);
    // Verrou de l'annonce, puis relecture : état à jour sous verrou.
    await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${found.listingId} FOR UPDATE`;
    const booking = await tx.booking.findUnique({ where: { id: found.id } });
    const result = nextStatus(booking, action);
    // Annonce masquée / suspendue : une demande ne peut plus être acceptée (le refus reste permis).
    if (result.ok && action === "confirm" && found.listing.status !== "ACTIVE") {
      throw httpError(409, "Annonce non active : impossible d'accepter cette demande");
    }
    if (!result.ok) {
      if (result.expired && booking.status === "PENDING") {
        await tx.booking.update({ where: { id: booking.id }, data: { status: "EXPIRED" } });
      }
      return { error: result };
    }
    const by = !user || (found.guestId != null && found.guestId === user.id) ? "guest" : "host";
    if (result.unchanged) return { booking, changed: false, by };
    if (result.status === "CONFIRMED") {
      // Garde-fou : les dates d'une demande PENDING sont déjà réservées, sauf incohérence.
      const candidates = await overlapping(tx, booking.listingId, booking.checkIn, booking.checkOut);
      if (findStayConflict({ checkIn: booking.checkIn, checkOut: booking.checkOut, ...candidates, excludeBookingId: booking.id })) {
        throw httpError(409, "Ces dates ne sont plus disponibles");
      }
    }
    const data = { status: result.status };
    // Demande acceptée, paiements actifs : à payer avant l'échéance.
    if (result.status === "CONFIRMED" && config.payments.enabled) {
      data.paymentStatus = "UNPAID";
      data.paymentDueAt = paymentDueDate("request", config.payments);
    }
    // Annulation d'une réservation payée : remboursement manuel par l'administrateur.
    if (result.status === "CANCELLED" && booking.paymentStatus === "PAID") data.paymentStatus = "REFUND_DUE";
    await tx.booking.update({ where: { id: booking.id }, data });
    return { booking, changed: true, by, refundDue: data.paymentStatus === "REFUND_DUE" };
  });
  // Erreur métier levée après le commit (persistance éventuelle de EXPIRED conservée).
  if (outcome.error) throw httpError(outcome.error.code, outcome.error.error);
  const updated = await db.booking.findUnique({
    where: { id: outcome.booking.id },
    include: { ...guestBookingInclude, guest: publicPerson },
  });
  return { booking: updated, changed: outcome.changed, by: outcome.by, refundDue: Boolean(outcome.refundDue) };
}

const hostOnly = (b, user) => (b.listing.hostId !== user.id ? "Seul l'hôte peut répondre à cette demande" : null);

// Annulation par le voyageur ou l'hôte de l'annonce.
export function cancelBooking({ bookingId, user }, db = prisma) {
  return transition(
    bookingId,
    user,
    "cancel",
    (b, u) =>
      (b.guestId == null || b.guestId !== u.id) && b.listing.hostId !== u.id
        ? "Non autorisé à annuler cette réservation"
        : null,
    db
  );
}

// Réservation sans compte retrouvée par l'empreinte de son jeton d'accès. Jeton mal formé, inconnu
// ou expiré : 404 générique (aucune information sur l'existence de la réservation).
export async function findByGuestToken(token, include, db = prisma) {
  const notFound = () => httpError(404, "Réservation introuvable");
  if (!isGuestAccessTokenFormat(token)) throw notFound();
  const booking = await db.booking.findUnique({
    where: { guestAccessTokenHash: hashGuestAccessToken(token) },
    ...(include ? { include } : {}),
  });
  if (!booking || !isGuestAccessValid(booking)) throw notFound();
  return booking;
}

// Vue du voyageur sans compte : réservation + annonce publique (hôte sans e-mail).
export function getGuestBooking({ token }, db = prisma) {
  return findByGuestToken(token, { listing: { include: listingBaseInclude } }, db);
}

// Annulation par le voyageur sans compte : mêmes règles que pour un voyageur connecté.
export async function cancelGuestBooking({ token }, db = prisma) {
  const found = await findByGuestToken(token, null, db);
  return transition(found.id, null, "cancel", () => null, db);
}

// L'hôte accepte une demande PENDING (non expirée).
export function confirmBooking({ bookingId, user }, db = prisma) {
  return transition(bookingId, user, "confirm", hostOnly, db);
}

// L'hôte refuse une demande PENDING (non expirée).
export function declineBooking({ bookingId, user }, db = prisma) {
  return transition(bookingId, user, "decline", hostOnly, db);
}

// Réservations du voyageur (balayage des demandes expirées et des impayées d'abord).
// -> { bookings, unpaidCancelled } : identifiants annulés faute de paiement (à notifier ; toujours
// vide si les paiements sont désactivés).
export async function listGuestBookings(userId, db = prisma, paymentDeps = {}) {
  await sweepExpired({ guestId: userId }, db);
  const unpaidCancelled = await sweepUnpaid({ guestId: userId }, db, new Date(), paymentDeps);
  const bookings = await db.booking.findMany({
    where: { guestId: userId },
    include: guestBookingInclude,
    orderBy: { checkIn: "desc" },
  });
  return { bookings, unpaidCancelled };
}

// Réservations reçues sur les annonces de l'hôte (balayage des demandes expirées et des impayées d'abord).
// -> { bookings, unpaidCancelled } (voir listGuestBookings).
export async function listHostBookings(hostId, db = prisma, paymentDeps = {}) {
  await sweepExpired({ listing: { hostId } }, db);
  const unpaidCancelled = await sweepUnpaid({ listing: { hostId } }, db, new Date(), paymentDeps);
  const bookings = await db.booking.findMany({
    where: { listing: { hostId } },
    include: hostBookingInclude,
    orderBy: { checkIn: "desc" },
  });
  return { bookings, unpaidCancelled };
}
