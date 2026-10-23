import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// Configuration de test AVANT l'import (env.js est évalué à l'import). Aucune connexion : les
// fonctions de session reçoivent un dépôt en mémoire, les contrôleurs un prisma remplacé.
const SECRET = "secret-de-test-suffisamment-long-pour-hs256-0123456789";
process.env.JWT_SECRET = SECRET;
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.DIRECT_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.NODE_ENV = "test";
process.env.STORAGE_DRIVER = "local";
process.env.EMAIL_DRIVER = "console";
process.env.JWT_ACCESS_TTL = "15m";
process.env.REFRESH_TTL_DAYS = "30";
delete process.env.COOKIE_SECURE;

const { startSession, rotateRefreshToken, setRefreshCookie, clearRefreshCookie } = await import(
  "../src/api/auth/session.js"
);
const authController = await import("../src/api/auth/auth.controller.js");
const { requireAppHeader } = await import("../src/middleware/auth.js");
const { verifyToken } = await import("../src/config/jwt.js");
const { hashRefreshToken } = await import("../src/utils/refreshToken.js");
const { default: prisma } = await import("../src/config/db.js");

const DAY = 24 * 3600 * 1000;
const alice = { id: "u1", email: "a@b.c", name: "Alice", avatar: null, role: "GUEST", passwordChangedAt: null };

// Dépôt RefreshToken en mémoire (sous-ensemble de l'API Prisma utilisé par session.js).
function memoryDb(users = [alice]) {
  const rows = [];
  const usersById = new Map(users.map((u) => [u.id, u]));
  const matches = (row, where) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && "lt" in v) return row[k] < v.lt;
      return row[k] === v;
    });
  return {
    rows,
    usersById,
    refreshToken: {
      async findUnique({ where, include }) {
        const row = rows.find((r) => r.tokenHash === where.tokenHash);
        if (!row) return null;
        return include?.user ? { ...row, user: { ...usersById.get(row.userId) } } : { ...row };
      },
      async create({ data }) {
        assert.equal(rows.some((r) => r.tokenHash === data.tokenHash), false, "tokenHash unique");
        const row = { revokedAt: null, replacedById: null, ...data };
        rows.push(row);
        return row;
      },
      async updateMany({ where, data }) {
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      async deleteMany({ where }) {
        const keep = rows.filter((r) => !matches(r, where));
        const count = rows.length - keep.length;
        rows.splice(0, rows.length, ...keep);
        return { count };
      },
    },
  };
}

function fakeRes() {
  return {
    statusCode: 200,
    cookies: [],
    cleared: [],
    body: undefined,
    ended: false,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name, options) {
      this.cleared.push({ name, options });
      return this;
    },
  };
}

const silentLog = { info() {}, warn() {}, error() {} };

test("startSession : cookie httpOnly posé, seul le hash stocké, jeton d'accès 15 min, nettoyage des expirés", async () => {
  const db = memoryDb();
  const now = new Date();
  db.rows.push({ id: "old", userId: "u1", tokenHash: "x".repeat(64), familyId: "f0", expiresAt: new Date(now - 1), createdAt: new Date(now - 31 * DAY), revokedAt: null });
  const res = fakeRes();
  const access = await startSession({ headers: { "user-agent": "A".repeat(400) } }, res, "u1", { db, now });

  assert.equal(db.rows.some((r) => r.id === "old"), false, "jeton expiré supprimé");
  assert.equal(db.rows.length, 1);
  const [cookie] = res.cookies;
  assert.equal(cookie.name, "afrikabnb_rt");
  assert.deepEqual(cookie.options, { httpOnly: true, secure: false, sameSite: "strict", path: "/api/auth", maxAge: 30 * DAY });
  const row = db.rows[0];
  assert.equal(row.tokenHash, hashRefreshToken(cookie.value));
  assert.notEqual(row.tokenHash, cookie.value);
  assert.equal(row.expiresAt.getTime() - now.getTime(), 30 * DAY);
  assert.equal(row.createdAt, now);
  assert.equal(row.userAgent.length, 255);
  const payload = verifyToken(access);
  assert.equal(payload.userId, "u1");
  assert.equal(payload.exp - payload.iat, 15 * 60);
});

test("rotation : l'ancien jeton est révoqué (replacedById), le nouveau garde la famille", async () => {
  const db = memoryDb();
  const res = fakeRes();
  await startSession({ headers: {} }, res, "u1", { db });
  const first = res.cookies[0].value;

  const r1 = await rotateRefreshToken(db, first, { userAgent: "UA" });
  assert.equal(r1.ok, true);
  assert.deepEqual(r1.user, { id: "u1", email: "a@b.c", name: "Alice", avatar: null, role: "GUEST" });
  assert.notEqual(r1.token, first);
  const [oldRow, newRow] = db.rows;
  assert.ok(oldRow.revokedAt instanceof Date);
  assert.equal(oldRow.replacedById, newRow.id);
  assert.equal(newRow.familyId, oldRow.familyId);
  assert.equal(newRow.revokedAt, null);
  assert.equal(newRow.tokenHash, hashRefreshToken(r1.token));

  const r2 = await rotateRefreshToken(db, r1.token);
  assert.equal(r2.ok, true);
  assert.equal(db.rows.length, 3);
});

test("réutilisation d'un jeton déjà tourné : toute la famille est révoquée, les autres familles non", async () => {
  const db = memoryDb();
  const resA = fakeRes();
  const resB = fakeRes();
  await startSession({ headers: {} }, resA, "u1", { db });
  await startSession({ headers: {} }, resB, "u1", { db });
  const stolen = resA.cookies[0].value;
  const legit = await rotateRefreshToken(db, stolen);
  assert.equal(legit.ok, true);

  const replay = await rotateRefreshToken(db, stolen);
  assert.deepEqual(replay, { ok: false, reason: "reused", userId: "u1" });
  const familyA = db.rows.find((r) => r.tokenHash === hashRefreshToken(stolen)).familyId;
  assert.ok(db.rows.filter((r) => r.familyId === familyA).every((r) => r.revokedAt));
  // Le successeur légitime est lui aussi révoqué.
  assert.equal((await rotateRefreshToken(db, legit.token)).reason, "reused");
  // Session de l'autre appareil (autre famille) intacte.
  assert.equal((await rotateRefreshToken(db, resB.cookies[0].value)).ok, true);
});

test("rotation concurrente du même jeton : une seule réussit, l'autre est traitée comme une réutilisation", async () => {
  const db = memoryDb();
  const res = fakeRes();
  await startSession({ headers: {} }, res, "u1", { db });
  const token = res.cookies[0].value;
  // Les deux lectures voient le jeton actif ; la révocation conditionnelle départage.
  const [a, b] = await Promise.all([rotateRefreshToken(db, token), rotateRefreshToken(db, token)]);
  assert.deepEqual([a.ok, b.ok].sort(), [false, true]);
  assert.equal((a.ok ? b : a).reason, "reused");
});

test("rotation refusée : jeton inconnu, expiré, ou antérieur au dernier changement de mot de passe", async () => {
  const db = memoryDb();
  assert.equal((await rotateRefreshToken(db, "inconnu")).reason, "invalid");

  const res = fakeRes();
  const created = new Date(Date.now() - 2 * DAY);
  await startSession({ headers: {} }, res, "u1", { db, now: created });
  const token = res.cookies[0].value;
  assert.equal((await rotateRefreshToken(db, token, { now: new Date(created.getTime() + 31 * DAY) })).reason, "expired");

  db.usersById.get("u1").passwordChangedAt = new Date(created.getTime() + 1000);
  try {
    assert.equal((await rotateRefreshToken(db, token)).reason, "password_changed");
    assert.ok(db.rows.every((r) => r.revokedAt), "tous les jetons de l'utilisateur révoqués");
  } finally {
    db.usersById.get("u1").passwordChangedAt = null;
  }
});

function useDb(db) {
  prisma.refreshToken = db.refreshToken;
}

test("POST /refresh : 401 sans cookie, rotation + { token, user } + nouveau cookie, réutilisation -> 401 et cookie effacé", async () => {
  const db = memoryDb();
  useDb(db);
  const noCookie = fakeRes();
  await authController.refresh({ headers: {}, log: silentLog }, noCookie, assert.fail);
  assert.equal(noCookie.statusCode, 401);

  const login = fakeRes();
  await startSession({ headers: {} }, login, "u1", { db });
  const first = login.cookies[0].value;
  const ok = fakeRes();
  await authController.refresh({ headers: { cookie: `afrikabnb_rt=${first}` }, log: silentLog }, ok, assert.fail);
  assert.equal(ok.statusCode, 200);
  assert.equal(verifyToken(ok.body.token).userId, "u1");
  assert.equal(ok.body.user.email, "a@b.c");
  assert.equal("passwordChangedAt" in ok.body.user, false);
  assert.notEqual(ok.cookies[0].value, first);

  let warned = 0;
  const reused = fakeRes();
  await authController.refresh(
    { headers: { cookie: `afrikabnb_rt=${first}` }, log: { ...silentLog, warn: () => warned++ } },
    reused,
    assert.fail
  );
  assert.equal(reused.statusCode, 401);
  assert.equal(reused.cleared[0].name, "afrikabnb_rt");
  assert.equal(reused.cleared[0].options.path, "/api/auth");
  assert.equal(warned, 1);
});

test("POST /logout : révoque le jeton du cookie, efface le cookie, 204 même sans cookie ou si la base échoue", async () => {
  const db = memoryDb();
  useDb(db);
  const login = fakeRes();
  await startSession({ headers: {} }, login, "u1", { db });
  const res = fakeRes();
  await authController.logout({ headers: { cookie: `afrikabnb_rt=${login.cookies[0].value}` }, log: silentLog }, res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
  assert.ok(db.rows[0].revokedAt);
  assert.equal(res.cleared.length, 1);

  const anon = fakeRes();
  await authController.logout({ headers: {}, log: silentLog }, anon);
  assert.equal(anon.statusCode, 204);

  prisma.refreshToken = { updateMany: async () => Promise.reject(new Error("db down")) };
  const down = fakeRes();
  await authController.logout({ headers: { cookie: `afrikabnb_rt=${"a".repeat(43)}` }, log: silentLog }, down);
  assert.equal(down.statusCode, 204);
});

test("POST /logout-all : révoque tous les jetons de l'utilisateur", async () => {
  const db = memoryDb();
  useDb(db);
  await startSession({ headers: {} }, fakeRes(), "u1", { db });
  await startSession({ headers: {} }, fakeRes(), "u1", { db });
  const res = fakeRes();
  await authController.logoutAll({ user: { id: "u1" }, headers: {}, log: silentLog }, res, assert.fail);
  assert.equal(res.statusCode, 204);
  assert.ok(db.rows.every((r) => r.revokedAt));
});

test("requireAppHeader : 403 sans X-Requested-With: afrikabnb", () => {
  const res = fakeRes();
  let nextCalled = false;
  requireAppHeader({ headers: {} }, res, () => (nextCalled = true));
  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
  requireAppHeader({ headers: { "x-requested-with": "afrikabnb" } }, fakeRes(), () => (nextCalled = true));
  assert.equal(nextCalled, true);
});

test("Set-Cookie réel (Express) : HttpOnly, SameSite=Strict, Path=/api/auth, Max-Age 30 j ; effacement", async () => {
  const app = express();
  app.get("/set", (req, res) => (setRefreshCookie(res, "abc"), res.end()));
  app.get("/clear", (req, res) => (clearRefreshCookie(res), res.end()));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const set = (await fetch(`${base}/set`)).headers.get("set-cookie");
    assert.match(set, /^afrikabnb_rt=abc;/);
    assert.match(set, /Max-Age=2592000/);
    assert.match(set, /Path=\/api\/auth/);
    assert.match(set, /HttpOnly/);
    assert.match(set, /SameSite=Strict/);
    assert.doesNotMatch(set, /Secure/); // NODE_ENV=test sans COOKIE_SECURE
    const clear = (await fetch(`${base}/clear`)).headers.get("set-cookie");
    assert.match(clear, /^afrikabnb_rt=;/);
    assert.match(clear, /Expires=Thu, 01 Jan 1970/);
    assert.match(clear, /Path=\/api\/auth/);
  } finally {
    server.close();
  }
});

test("reset-password : révoque tous les jetons de renouvellement de l'utilisateur dans la transaction", async () => {
  const { generateResetToken } = await import("../src/utils/resetToken.js");
  const db = memoryDb();
  await startSession({ headers: {} }, fakeRes(), "u1", { db });
  await startSession({ headers: {} }, fakeRes(), "u1", { db });
  const { token, tokenHash, expiresAt } = generateResetToken();
  const record = { id: "r1", userId: "u1", tokenHash, expiresAt, usedAt: null };
  let userUpdate;
  const tx = {
    passwordResetToken: {
      findUnique: async () => record,
      updateMany: async ({ where }) => ({ count: where.id ? 1 : 0 }),
    },
    user: { update: async (args) => (userUpdate = args) },
    refreshToken: db.refreshToken,
  };
  prisma.$transaction = async (fn) => fn(tx);
  const res = fakeRes();
  await authController.resetPassword({ body: { token, newPassword: "nouveau-mdp" }, log: silentLog }, res, assert.fail);
  assert.equal(res.statusCode, 200);
  assert.ok(userUpdate.data.passwordChangedAt instanceof Date);
  assert.ok(db.rows.every((r) => r.revokedAt), "toutes les sessions fermées");
});
