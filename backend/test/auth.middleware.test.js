import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

// Configuration de test AVANT l'import (env.js est évalué à l'import ; dotenv n'écrase pas ces
// valeurs). Aucune connexion : prisma.user.findUnique est remplacé ci-dessous.
const SECRET = "secret-de-test-suffisamment-long-pour-hs256-0123456789";
process.env.JWT_SECRET = SECRET;
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.DIRECT_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.NODE_ENV = "test";
process.env.STORAGE_DRIVER = "local";
process.env.EMAIL_DRIVER = "console";

const { authenticateToken, optionalAuth } = await import("../src/middleware/auth.js");
const { default: prisma } = await import("../src/config/db.js");

function call(token, user) {
  prisma.user.findUnique = async () => user;
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body });
        return this;
      },
    };
    const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
    authenticateToken(req, res, (err) => resolve({ status: err ? 500 : 200, user: req.user }));
  });
}

const sign = (iat) => jwt.sign({ userId: "u1", iat }, SECRET, { algorithm: "HS256", expiresIn: "1h" });
const baseUser = { id: "u1", email: "a@b.c", name: null, avatar: null, role: "GUEST" };
const nowSec = Math.floor(Date.now() / 1000);

test("authenticateToken : 401 sans token, 403 token invalide", async () => {
  assert.equal((await call(null, baseUser)).status, 401);
  assert.equal((await call("abc.def.ghi", baseUser)).status, 403);
});

test("authenticateToken : JWT émis avant passwordChangedAt refusé (401)", async () => {
  const changedAt = new Date((nowSec - 60) * 1000);
  const old = await call(sign(nowSec - 120), { ...baseUser, passwordChangedAt: changedAt });
  assert.equal(old.status, 401);
  assert.match(old.body.error, /reconnectez-vous/);
  const fresh = await call(sign(nowSec - 30), { ...baseUser, passwordChangedAt: changedAt });
  assert.equal(fresh.status, 200);
  // passwordChangedAt n'est jamais exposé dans req.user (renvoyé par /api/auth/me).
  assert.equal("passwordChangedAt" in fresh.user, false);
  assert.equal((await call(sign(nowSec - 120), { ...baseUser, passwordChangedAt: null })).status, 200);
});

async function callOptional(token, user) {
  prisma.user.findUnique = async () => user;
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const err = await new Promise((resolve) => optionalAuth(req, {}, resolve));
  return { userId: req.userId, err };
}

test("optionalAuth : userId renseigné seulement pour un JWT valide et non révoqué", async () => {
  const changedAt = new Date((nowSec - 60) * 1000);
  assert.equal((await callOptional(sign(nowSec - 30), { ...baseUser, passwordChangedAt: changedAt })).userId, "u1");
  assert.equal((await callOptional(sign(nowSec - 120), { ...baseUser, passwordChangedAt: changedAt })).userId, undefined);
  assert.equal((await callOptional(sign(nowSec - 30), null)).userId, undefined);
  assert.equal((await callOptional("abc.def.ghi", baseUser)).userId, undefined);
  const anon = await callOptional(null, baseUser);
  assert.equal(anon.userId, undefined);
  assert.equal(anon.err, undefined);
});
