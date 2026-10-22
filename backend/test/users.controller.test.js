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
  prisma.user.findUnique = async () => ({ password: hash });
  prisma.user.update = async (args) => ((updateArgs = args), publicUser);
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(b) {
        resolve({ status: this.statusCode, body: b, updateArgs });
        return this;
      },
    };
    updateProfile({ user: { id: "u1" }, body }, res, reject);
  });
}

test("updateProfile : changement de mot de passe -> passwordChangedAt + nouveau jeton non révoqué", async () => {
  const { status, body, updateArgs } = await call({ currentPassword: "ancien-mdp", newPassword: "nouveau-mdp" });
  assert.equal(status, 200);
  assert.ok(updateArgs.data.passwordChangedAt instanceof Date);
  assert.equal(body.id, "u1");
  const payload = jwt.verify(body.token, SECRET, { algorithms: ["HS256"] });
  assert.equal(payload.userId, "u1");
  assert.equal(isTokenRevokedByPasswordChange(payload.iat, updateArgs.data.passwordChangedAt), false);
});

test("updateProfile : sans changement de mot de passe, ni passwordChangedAt ni jeton", async () => {
  const { body, updateArgs } = await call({ name: "Kofi" });
  assert.equal("passwordChangedAt" in updateArgs.data, false);
  assert.equal("token" in body, false);
});

test("updateProfile : mot de passe actuel incorrect -> 401", async () => {
  const { status } = await call({ currentPassword: "faux", newPassword: "nouveau-mdp" });
  assert.equal(status, 401);
});
