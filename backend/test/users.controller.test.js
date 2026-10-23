import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const SECRET = "secret-de-test-suffisamment-long-pour-hs256-0123456789";
process.env.JWT_SECRET = SECRET;
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.DIRECT_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.NODE_ENV = "test";
process.env.STORAGE_DRIVER = "local";
process.env.EMAIL_DRIVER = "console";

const { updateProfile } = await import("../src/api/users/users.controller.js");
const { default: prisma } = await import("../src/config/db.js");
const { isTokenRevokedByPasswordChange } = await import("../src/utils/resetToken.js");

const publicUser = { id: "u1", email: "a@b.c", name: null, avatar: null, role: "GUEST" };

async function call(body) {
  const hash = await bcrypt.hash("ancien-mdp", 4);
  let updateArgs;
  const ops = [];
  prisma.user.findUnique = async () => ({ password: hash });
  prisma.user.update = async (args) => ((updateArgs = args), publicUser);
  // Jetons de renouvellement : opérations enregistrées dans l'ordre (aucune base).
  prisma.refreshToken = {
    updateMany: async (args) => (ops.push(["updateMany", args]), { count: 2 }),
    deleteMany: async (args) => (ops.push(["deleteMany", args]), { count: 0 }),
    create: async (args) => (ops.push(["create", args]), args.data),
  };
  const cookies = [];
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) {
        this.statusCode = c;
        return this;
      },
      cookie(name, value, options) {
        cookies.push({ name, value, options });
        return this;
      },
      json(b) {
        resolve({ status: this.statusCode, body: b, updateArgs, ops, cookies });
        return this;
      },
    };
    updateProfile({ user: { id: "u1" }, body, headers: {} }, res, reject);
  });
}

test("updateProfile : changement de mot de passe -> passwordChangedAt, sessions révoquées, nouvelle session non révoquée", async () => {
  const { status, body, updateArgs, ops, cookies } = await call({ currentPassword: "ancien-mdp", newPassword: "nouveau-mdp" });
  // Tous les jetons de renouvellement révoqués AVANT l'émission du nouveau.
  const revokeIdx = ops.findIndex(([op, a]) => op === "updateMany" && a.where.userId === "u1" && a.where.revokedAt === null);
  const createIdx = ops.findIndex(([op]) => op === "create");
  assert.ok(revokeIdx >= 0 && createIdx > revokeIdx);
  const created = ops[createIdx][1].data;
  assert.equal(created.userId, "u1");
  assert.ok(created.createdAt >= updateArgs.data.passwordChangedAt, "nouveau jeton postérieur au changement");
  assert.equal(cookies.length, 1);
  assert.equal(cookies[0].name, "afrikabnb_rt");
  assert.equal(cookies[0].options.httpOnly, true);
  assert.equal(status, 200);
  assert.ok(updateArgs.data.passwordChangedAt instanceof Date);
  assert.equal(body.id, "u1");
  const payload = jwt.verify(body.token, SECRET, { algorithms: ["HS256"] });
  assert.equal(payload.userId, "u1");
  assert.equal(isTokenRevokedByPasswordChange(payload.iat, updateArgs.data.passwordChangedAt), false);
});

test("updateProfile : sans changement de mot de passe, ni passwordChangedAt ni jeton", async () => {
  const { body, updateArgs, ops, cookies } = await call({ name: "Kofi" });
  assert.equal("passwordChangedAt" in updateArgs.data, false);
  assert.equal("token" in body, false);
  assert.equal(ops.length, 0);
  assert.equal(cookies.length, 0);
});

test("updateProfile : mot de passe actuel incorrect -> 401", async () => {
  const { status } = await call({ currentPassword: "faux", newPassword: "nouveau-mdp" });
  assert.equal(status, 401);
});
