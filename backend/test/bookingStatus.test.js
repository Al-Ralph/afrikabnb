import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PENDING_TTL_MS,
  MAX_PENDING_PER_GUEST,
  MAX_REQUEST_NIGHTS,
  activePendingWhere,
  blockingBookingWhere,
  effectiveStatus,
  findStayConflict,
  isBlocking,
  nextStatus,
  pendingExpiresAt,
} from "../src/utils/bookingStatus.js";

const now = new Date("2026-10-22T12:00:00.000Z");
const hoursAgo = (h) => new Date(now.getTime() - h * 3600 * 1000);
const b = (o) => ({ id: "b1", status: "PENDING", createdAt: hoursAgo(1), checkIn: "2026-11-01", checkOut: "2026-11-05", ...o });

test("PENDING expire après 48 h ou si le jour d'arrivée est passé", () => {
  assert.equal(PENDING_TTL_MS, 48 * 3600 * 1000);
  assert.equal(effectiveStatus(b({ createdAt: hoursAgo(47) }), now), "PENDING");
  assert.equal(effectiveStatus(b({ createdAt: hoursAgo(48) }), now), "EXPIRED");
  assert.equal(effectiveStatus(b({ checkIn: "2026-10-21", checkOut: "2026-10-25" }), now), "EXPIRED");
  // Arrivée aujourd'hui : encore valide.
  assert.equal(effectiveStatus(b({ checkIn: "2026-10-22" }), now), "PENDING");
  // Les autres statuts ne sont jamais recalculés.
  assert.equal(effectiveStatus(b({ status: "CONFIRMED", createdAt: hoursAgo(500) }), now), "CONFIRMED");
  assert.equal(pendingExpiresAt(hoursAgo(1)).toISOString(), "2026-10-24T11:00:00.000Z");
});

test("seules CONFIRMED et PENDING non expirée bloquent les dates", () => {
  assert.equal(isBlocking(b({ status: "CONFIRMED" }), now), true);
  assert.equal(isBlocking(b(), now), true);
  assert.equal(isBlocking(b({ createdAt: hoursAgo(49) }), now), false);
  for (const status of ["CANCELLED", "DECLINED", "EXPIRED"]) assert.equal(isBlocking(b({ status }), now), false);
});

test("transitions : confirmer / refuser une demande en attente uniquement", () => {
  assert.deepEqual(nextStatus(b(), "confirm", now), { ok: true, status: "CONFIRMED" });
  assert.deepEqual(nextStatus(b(), "decline", now), { ok: true, status: "DECLINED" });
  const expired = nextStatus(b({ createdAt: hoursAgo(50) }), "confirm", now);
  assert.equal(expired.ok, false);
  assert.equal(expired.code, 409);
  assert.equal(expired.expired, true);
  assert.equal(nextStatus(b({ status: "CONFIRMED" }), "decline", now).ok, false);
  assert.equal(nextStatus(b({ status: "CANCELLED" }), "confirm", now).ok, false);
});

test("transitions : annulation", () => {
  assert.deepEqual(nextStatus(b({ status: "CONFIRMED" }), "cancel", now), { ok: true, status: "CANCELLED" });
  assert.deepEqual(nextStatus(b(), "cancel", now), { ok: true, status: "CANCELLED" });
  assert.equal(nextStatus(b({ status: "CANCELLED" }), "cancel", now).unchanged, true);
  assert.equal(nextStatus(b({ status: "DECLINED" }), "cancel", now).ok, false);
  const started = nextStatus(b({ status: "CONFIRMED", checkIn: "2026-10-22", checkOut: "2026-10-25" }), "cancel", now);
  assert.equal(started.ok, false);
  assert.equal(started.error, "Le séjour a déjà commencé");
});

test("findStayConflict : réservations bloquantes et périodes bloquées, intervalles semi-ouverts", () => {
  const stay = { checkIn: "2026-11-03", checkOut: "2026-11-06", now };
  assert.equal(findStayConflict({ ...stay }), null);
  // Réservation bloquante qui chevauche
  assert.deepEqual(findStayConflict({ ...stay, bookings: [b({ status: "CONFIRMED" })] }), { type: "booking", id: "b1" });
  // Réservation libérée (refusée / PENDING expirée) : pas de conflit
  assert.equal(findStayConflict({ ...stay, bookings: [b({ status: "DECLINED" })] }), null);
  assert.equal(findStayConflict({ ...stay, bookings: [b({ createdAt: hoursAgo(60) })] }), null);
  // Exclusion de la réservation elle-même (confirmation)
  assert.equal(findStayConflict({ ...stay, bookings: [b()], excludeBookingId: "b1" }), null);
  // Période bloquée par l'hôte
  const blocked = { id: "p1", startDate: new Date("2026-11-05T00:00:00.000Z"), endDate: new Date("2026-11-08T00:00:00.000Z") };
  assert.deepEqual(findStayConflict({ ...stay, blockedPeriods: [blocked] }), { type: "blocked", id: "p1" });
  // Départ le jour où commence le blocage : pas de chevauchement
  assert.equal(findStayConflict({ checkIn: "2026-11-01", checkOut: "2026-11-05", blockedPeriods: [blocked], now }), null);
  // Arrivée le jour où finit le blocage
  assert.equal(findStayConflict({ checkIn: "2026-11-08", checkOut: "2026-11-10", blockedPeriods: [blocked], now }), null);
});

test("activePendingWhere : demandes PENDING non expirées, réutilisé par blockingBookingWhere", () => {
  const where = activePendingWhere(now);
  assert.equal(where.status, "PENDING");
  assert.equal(where.createdAt.gt.getTime(), now.getTime() - PENDING_TTL_MS);
  assert.equal(where.checkIn.gte.toISOString(), "2026-10-22T00:00:00.000Z");
  assert.deepEqual(blockingBookingWhere(now).OR, [{ status: "CONFIRMED" }, where]);
});

test("quotas anti-abus des demandes", () => {
  assert.equal(MAX_PENDING_PER_GUEST, 3);
  assert.equal(MAX_REQUEST_NIGHTS, 60);
});
