import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "secret-de-test-suffisamment-long-pour-hs256-0123456789";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.DIRECT_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.NODE_ENV = "test";
process.env.STORAGE_DRIVER = "local";
process.env.EMAIL_DRIVER = "console";

const { updateUserRole } = await import("../src/services/admin.js");

async function rejects(promise, statusCode, message) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.statusCode, statusCode);
    assert.equal(err.message, message);
    return true;
  });
}

const actor = { id: "admin1", role: "ADMIN" };

// target : utilisateur ciblé (ou null) ; admins : nombre d'administrateurs en base.
function roleDb({ target, admins = 1 }) {
  const calls = { updates: [], txOptions: null };
  const tx = {
    user: {
      findUnique: async () => target,
      count: async ({ where }) => (assert.deepEqual(where, { role: "ADMIN" }), admins),
      update: async ({ data }) => (calls.updates.push(data), { ...target, ...data }),
    },
  };
  const db = { $transaction: async (fn, options) => ((calls.txOptions = options), fn(tx)) };
  return { db, calls };
}

test("updateUserRole : un admin ne peut pas retirer son propre rôle (409, sans transaction)", async () => {
  const db = {
    $transaction: async () => {
      throw new Error("transaction inattendue");
    },
  };
  await rejects(
    updateUserRole({ actor, targetId: "admin1", role: "HOST" }, db),
    409,
    "Impossible de retirer son propre rôle d'administrateur"
  );
});

test("updateUserRole : le dernier administrateur ne peut pas être rétrogradé (409)", async () => {
  const { db, calls } = roleDb({ target: { id: "admin2", role: "ADMIN" }, admins: 1 });
  await rejects(
    updateUserRole({ actor, targetId: "admin2", role: "GUEST" }, db),
    409,
    "Impossible de retirer le dernier administrateur"
  );
  assert.deepEqual(calls.updates, []);
});

test("updateUserRole : rétrogradation permise s'il reste un admin, transaction Serializable", async () => {
  const { db, calls } = roleDb({ target: { id: "admin2", role: "ADMIN" }, admins: 2 });
  const { before, user } = await updateUserRole({ actor, targetId: "admin2", role: "HOST" }, db);
  assert.equal(before, "ADMIN");
  assert.equal(user.role, "HOST");
  assert.deepEqual(calls.updates, [{ role: "HOST" }]);
  assert.deepEqual(calls.txOptions, { isolationLevel: "Serializable" });
});

test("updateUserRole : utilisateur absent -> 404 ; promotion en ADMIN sans contrôle du nombre d'admins", async () => {
  await rejects(updateUserRole({ actor, targetId: "x", role: "HOST" }, roleDb({ target: null }).db), 404, "Utilisateur introuvable");
  const { db, calls } = roleDb({ target: { id: "u1", role: "GUEST" }, admins: 0 });
  const { before } = await updateUserRole({ actor, targetId: "u1", role: "ADMIN" }, db);
  assert.equal(before, "GUEST");
  assert.deepEqual(calls.updates, [{ role: "ADMIN" }]);
});
