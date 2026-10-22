// Règles de statut des réservations (logique pure, sans base de données).
//
// Expiration des demandes PENDING : statut calculé à la lecture + persistance paresseuse.
// - Une demande PENDING est « expirée » si elle a plus de 48 h ou si son jour d'arrivée est passé.
// - Le statut renvoyé par l'API (`effectiveStatus`) et les filtres de disponibilité
//   (`blockingBookingWhere`) appliquent cette règle directement : le résultat est exact sans tâche
//   planifiée (cron), même si la ligne en base est encore PENDING.
// - La valeur EXPIRED est écrite en base quand une demande expirée est touchée (confirmation,
//   refus, annulation) et par un balayage `updateMany` lors de la lecture des listes de réservations
//   (voyageur / hôte), pour que la base finisse par refléter l'état réel.
import { formatDay, todayDay } from "./booking.js";

export const PENDING_TTL_MS = 48 * 60 * 60 * 1000;
// Anti-abus : demandes en attente simultanées par voyageur, et durée maximale d'une demande.
export const MAX_PENDING_PER_GUEST = 3;
export const MAX_REQUEST_NIGHTS = 60;

// Statuts qui bloquent les dates (PENDING uniquement tant qu'il n'est pas expiré).
export const BLOCKING_STATUSES = ["PENDING", "CONFIRMED"];
// Statuts terminaux qui libèrent les dates.
export const RELEASED_STATUSES = ["CANCELLED", "DECLINED", "EXPIRED"];

const toDay = (d) => (d instanceof Date ? formatDay(d) : d);

// Date limite de création d'une demande PENDING encore valide.
export function pendingCutoff(now = new Date()) {
  return new Date(now.getTime() - PENDING_TTL_MS);
}

// Fin de validité d'une demande PENDING (création + 48 h).
export function pendingExpiresAt(createdAt) {
  return new Date(new Date(createdAt).getTime() + PENDING_TTL_MS);
}

export function isPendingExpired(booking, now = new Date()) {
  if (booking.status !== "PENDING") return false;
  if (new Date(booking.createdAt).getTime() <= pendingCutoff(now).getTime()) return true;
  // Jour d'arrivée passé sans réponse de l'hôte.
  return toDay(booking.checkIn) < todayDay(now);
}

// Statut tel qu'exposé par l'API (PENDING expiré -> EXPIRED).
export function effectiveStatus(booking, now = new Date()) {
  return isPendingExpired(booking, now) ? "EXPIRED" : booking.status;
}

// Vrai si la réservation occupe ses dates (CONFIRMED, ou PENDING non expirée).
export function isBlocking(booking, now = new Date()) {
  return BLOCKING_STATUSES.includes(effectiveStatus(booking, now));
}

// Filtre Prisma des demandes PENDING non expirées (complément de expiredPendingWhere).
export function activePendingWhere(now = new Date()) {
  return {
    status: "PENDING",
    createdAt: { gt: pendingCutoff(now) },
    checkIn: { gte: new Date(`${todayDay(now)}T00:00:00.000Z`) },
  };
}

// Filtre Prisma équivalent à isBlocking (à combiner avec un filtre de dates).
export function blockingBookingWhere(now = new Date()) {
  return { OR: [{ status: "CONFIRMED" }, activePendingWhere(now)] };
}

// Filtre Prisma des demandes PENDING expirées (balayage paresseux -> EXPIRED).
export function expiredPendingWhere(now = new Date()) {
  return {
    status: "PENDING",
    OR: [
      { createdAt: { lte: pendingCutoff(now) } },
      { checkIn: { lt: new Date(`${todayDay(now)}T00:00:00.000Z`) } },
    ],
  };
}

// Transitions autorisées. Retourne { ok: true, status } ou { ok: false, code, error }.
// action : "confirm" | "decline" (hôte), "cancel" (voyageur ou hôte).
export function nextStatus(booking, action, now = new Date()) {
  const current = effectiveStatus(booking, now);
  if (action === "confirm" || action === "decline") {
    if (current === "EXPIRED") return { ok: false, code: 409, error: "Cette demande a expiré", expired: true };
    if (current !== "PENDING") {
      return { ok: false, code: 409, error: "Seule une demande en attente peut être acceptée ou refusée" };
    }
    return { ok: true, status: action === "confirm" ? "CONFIRMED" : "DECLINED" };
  }
  if (action === "cancel") {
    if (current === "CANCELLED") return { ok: true, status: "CANCELLED", unchanged: true };
    if (current === "EXPIRED") return { ok: false, code: 409, error: "Cette demande a expiré", expired: true };
    if (current === "DECLINED") return { ok: false, code: 409, error: "Cette demande a été refusée" };
    if (toDay(booking.checkIn) <= todayDay(now)) {
      return { ok: false, code: 409, error: "Le séjour a déjà commencé" };
    }
    return { ok: true, status: "CANCELLED" };
  }
  throw new Error(`Action inconnue : ${action}`);
}

// Premier conflit entre un séjour [checkIn, checkOut[ et des réservations / périodes bloquées
// déjà présélectionnées, ou null. Les réservations non bloquantes sont ignorées.
// Retourne { type: "booking" | "blocked", id }.
export function findStayConflict({ checkIn, checkOut, bookings = [], blockedPeriods = [], excludeBookingId, now = new Date() }) {
  const start = toDay(checkIn);
  const end = toDay(checkOut);
  const overlaps = (s, e) => toDay(s) < end && start < toDay(e);
  for (const b of bookings) {
    if (b.id === excludeBookingId) continue;
    if (isBlocking(b, now) && overlaps(b.checkIn, b.checkOut)) return { type: "booking", id: b.id };
  }
  for (const p of blockedPeriods) {
    if (overlaps(p.startDate, p.endDate)) return { type: "blocked", id: p.id };
  }
  return null;
}
