import { test } from "node:test";
import assert from "node:assert/strict";
import { requireRole } from "../src/middleware/requireRole.js";

function run(mw, user) {
  const res = {
    statusCode: 200,
    body: undefined,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  let nextCalled = false;
  mw({ user }, res, () => (nextCalled = true));
  return { res, nextCalled };
}

test("requireRole : 401 sans utilisateur, 403 mauvais rôle, next() sinon", () => {
  const admin = requireRole("ADMIN");
  assert.equal(run(admin, undefined).res.statusCode, 401);
  const guest = run(admin, { id: "u", role: "GUEST" });
  assert.equal(guest.res.statusCode, 403);
  assert.equal(guest.nextCalled, false);
  assert.equal(run(admin, { id: "u", role: "HOST" }).res.statusCode, 403);
  assert.equal(run(admin, { id: "u", role: "ADMIN" }).nextCalled, true);
  assert.equal(run(requireRole("HOST", "ADMIN"), { id: "u", role: "HOST" }).nextCalled, true);
});
