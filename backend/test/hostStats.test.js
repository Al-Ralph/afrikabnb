import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHostStats, nightsInWindow, occupancyRate } from "../src/utils/hostStats.js";

test("nightsInWindow : séjour découpé à la fenêtre [from, to[", () => {
  assert.equal(nightsInWindow("2026-10-01", "2026-10-05", "2026-10-03", "2026-10-10"), 2);
  assert.equal(nightsInWindow("2026-10-01", "2026-10-05", "2026-10-05", "2026-10-10"), 0);
  assert.equal(nightsInWindow("2026-09-01", "2026-12-01", "2026-10-01", "2026-10-31"), 30);
});

test("occupancyRate : nuits réservées / nuits de la fenêtre, plafonné à 1", () => {
  const stays = [
    { checkIn: "2026-10-01", checkOut: "2026-10-04" },
    { checkIn: new Date("2026-10-10T00:00:00.000Z"), checkOut: new Date("2026-10-13T00:00:00.000Z") },
  ];
  assert.equal(occupancyRate(stays, "2026-10-01", "2026-10-31"), 0.2);
  assert.equal(occupancyRate([], "2026-10-01", "2026-10-31"), 0);
  assert.equal(occupancyRate([{ checkIn: "2026-01-01", checkOut: "2027-01-01" }], "2026-10-01", "2026-10-31"), 1);
  assert.equal(occupancyRate(stays, "2026-10-01", "2026-10-01"), 0);
});

test("computeHostStats : revenus par devise (passés / à venir), nuits, occupation, note", () => {
  const today = "2026-10-22";
  const stats = computeHostStats({
    today,
    listings: [
      { id: "a", title: "A", currency: "XOF", rating: 4.5, reviewCount: 2 },
      { id: "b", title: "B", currency: "EUR", rating: null, reviewCount: 0 },
      { id: "c", title: "C", currency: "XOF", rating: 4, reviewCount: 1 },
    ],
    bookings: [
      { listingId: "a", checkIn: "2026-10-01", checkOut: "2026-10-04", totalPrice: 30000 }, // passé
      { listingId: "a", checkIn: "2026-10-20", checkOut: "2026-10-25", totalPrice: 50000 }, // en cours
      { listingId: "b", checkIn: "2026-11-01", checkOut: "2026-11-03", totalPrice: "200.50" }, // à venir
    ],
  });
  assert.deepEqual(stats.revenue, {
    XOF: { past: 30000, upcoming: 50000, total: 80000 },
    EUR: { past: 0, upcoming: 200.5, total: 200.5 },
  });
  assert.deepEqual(stats.nightsBooked, { past: 3, upcoming: 7, total: 10 });
  const a = stats.occupancy.find((o) => o.listingId === "a");
  // 30 derniers jours [09-22, 10-22[ : 3 + 2 nuits
  assert.equal(a.last30, Math.round((5 / 30) * 10000) / 10000);
  // 30 prochains jours : 3 nuits (22, 23, 24)
  assert.equal(a.next30, 0.1);
  assert.equal(stats.occupancy.find((o) => o.listingId === "c").last90, 0);
  assert.equal(stats.averageRating, 4.33);
  assert.equal(stats.reviewCount, 3);
});
