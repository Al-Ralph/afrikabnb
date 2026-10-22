import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_AMOUNT,
  addDays,
  averageRating,
  computeTotalPrice,
  formatDay,
  nightsBetween,
  parseDay,
  rangesOverlap,
  todayDay,
} from "../src/utils/booking.js";

test("parseDay / formatDay : aller-retour en UTC minuit", () => {
  const d = parseDay("2026-03-01");
  assert.equal(d.toISOString(), "2026-03-01T00:00:00.000Z");
  assert.equal(formatDay(d), "2026-03-01");
});

test("todayDay utilise la date UTC", () => {
  assert.equal(todayDay(new Date("2026-10-21T23:30:00.000Z")), "2026-10-21");
});

test("addDays traverse les fins de mois et d'année", () => {
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
});

test("nightsBetween compte les nuits", () => {
  assert.equal(nightsBetween("2026-11-01", "2026-11-04"), 3);
  assert.equal(nightsBetween("2026-11-01", "2026-11-01"), 0);
  assert.equal(nightsBetween("2026-11-04", "2026-11-01"), -3);
  assert.equal(nightsBetween("2026-01-01", "2027-01-01"), 365);
});

test("computeTotalPrice = nuits x prix, au centime près", () => {
  assert.equal(computeTotalPrice(45000, 3), 135000);
  assert.equal(computeTotalPrice("120.10", 3), 360.3);
  assert.equal(computeTotalPrice(0.1, 3), 0.3);
  assert.ok(computeTotalPrice(400000, 365) > MAX_AMOUNT);
});

test("rangesOverlap : intervalles semi-ouverts [checkIn, checkOut[", () => {
  // Chevauchements
  assert.equal(rangesOverlap("2026-11-01", "2026-11-05", "2026-11-04", "2026-11-08"), true);
  assert.equal(rangesOverlap("2026-11-01", "2026-11-10", "2026-11-03", "2026-11-04"), true);
  assert.equal(rangesOverlap("2026-11-03", "2026-11-04", "2026-11-01", "2026-11-10"), true);
  // Départ le jour de l'arrivée suivante : pas de chevauchement
  assert.equal(rangesOverlap("2026-11-01", "2026-11-05", "2026-11-05", "2026-11-08"), false);
  assert.equal(rangesOverlap("2026-11-05", "2026-11-08", "2026-11-01", "2026-11-05"), false);
  // Accepte des Date
  assert.equal(
    rangesOverlap(parseDay("2026-11-01"), parseDay("2026-11-03"), "2026-11-02", "2026-11-04"),
    true
  );
});

test("averageRating : moyenne arrondie à 2 décimales, null sans avis", () => {
  assert.equal(averageRating(0, 0), null);
  assert.equal(averageRating(null, 0), null);
  assert.equal(averageRating(14, 3), 4.67);
  assert.equal(averageRating(9, 2), 4.5);
  assert.equal(averageRating(5, 1), 5);
});
