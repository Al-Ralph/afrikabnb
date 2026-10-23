import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "secret-de-test-suffisamment-long-pour-hs256-0123456789";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.DIRECT_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.NODE_ENV = "test";
process.env.STORAGE_DRIVER = "local";
process.env.EMAIL_DRIVER = "console";

const { deleteListing, getListing, updateListing } = await import("../src/services/listings.js");
const { createBlockedPeriod, removeBlockedPeriod } = await import("../src/services/blockedPeriods.js");
const { reorderImages } = await import("../src/services/listingImages.js");

async function rejects(promise, statusCode, message) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.statusCode, statusCode);
    assert.equal(err.message, message);
    return true;
  });
}

const owner = { id: "host", role: "HOST" };
const intruder = { id: "autre", role: "HOST" };
const log = { error() {}, info() {} };

// Aucune écriture ne doit avoir lieu quand la propriété est refusée.
function listingDb(listing) {
  const writes = [];
  const record = (name) => async (args) => (writes.push({ name, args }), {});
  const db = {
    listing: { findUnique: async () => listing, delete: record("listing.delete"), update: record("listing.update") },
    listingImage: { findMany: async () => [] },
    blockedPeriod: { deleteMany: async (args) => (writes.push({ name: "blockedPeriod.deleteMany", args }), { count: 1 }) },
    $transaction: async () => {
      throw new Error("transaction inattendue");
    },
  };
  return { db, writes };
}

test("updateListing / deleteListing : annonce absente -> 404, autre hôte -> 403 sans écriture", async () => {
  const missing = listingDb(null);
  await rejects(updateListing("l1", owner, { title: "x" }, missing.db), 404, "Annonce introuvable");
  await rejects(deleteListing("l1", owner, log, missing.db), 404, "Annonce introuvable");

  const other = listingDb({ id: "l1", hostId: "host", title: "Villa" });
  await rejects(updateListing("l1", intruder, { title: "x" }, other.db), 403, "Non autorisé à modifier cette annonce");
  await rejects(deleteListing("l1", intruder, log, other.db), 403, "Non autorisé à supprimer cette annonce");
  assert.deepEqual(other.writes, []);
});

test("deleteListing : le propriétaire supprime son annonce", async () => {
  const { db, writes } = listingDb({ id: "l1", hostId: "host", title: "Villa" });
  await deleteListing("l1", owner, log, db);
  assert.deepEqual(writes, [{ name: "listing.delete", args: { where: { id: "l1" } } }]);
});

test("getListing : annonce masquée visible par son hôte et un admin seulement (404 sinon)", async () => {
  const hidden = { id: "l1", hostId: "host", status: "HIDDEN" };
  const db = (role) => ({
    listing: { findUnique: async () => hidden },
    user: { findUnique: async () => (role ? { role } : null) },
  });
  assert.equal((await getListing("l1", "host", db()))?.id, "l1");
  assert.equal((await getListing("l1", "admin", db("ADMIN")))?.id, "l1");
  await rejects(getListing("l1", "autre", db("GUEST")), 404, "Annonce introuvable");
  await rejects(getListing("l1", undefined, db()), 404, "Annonce introuvable");
});

test("blockedPeriods : propriété vérifiée sous verrou FOR UPDATE (404 / 403)", async () => {
  const lockDb = (row) => {
    const queries = [];
    const tx = { $queryRaw: async (strings) => (queries.push(strings.join("?")), row ? [row] : []) };
    return { db: { $transaction: async (fn) => fn(tx) }, queries };
  };
  const period = { listingId: "l1", startDate: "2099-01-01", endDate: "2099-01-05" };
  const missing = lockDb(null);
  await rejects(createBlockedPeriod({ ...period, userId: "host" }, missing.db), 404, "Annonce introuvable");
  assert.match(missing.queries[0], /FOR UPDATE/);
  await rejects(
    createBlockedPeriod({ ...period, userId: "autre" }, lockDb({ hostId: "host" }).db),
    403,
    "Non autorisé à gérer cette annonce"
  );
  const other = listingDb({ hostId: "host" });
  await rejects(
    removeBlockedPeriod({ listingId: "l1", periodId: "p1", userId: "autre" }, other.db),
    403,
    "Non autorisé à gérer cette annonce"
  );
  assert.deepEqual(other.writes, []);
});

test("listingImages : autre hôte -> 403 avant toute transaction", async () => {
  const { db } = listingDb({ id: "l1", hostId: "host", title: "Villa" });
  await rejects(
    reorderImages({ listingId: "l1", userId: "autre", imageIds: ["i1"] }, db),
    403,
    "Non autorisé à modifier cette annonce"
  );
});
