import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { errorHandler } from "../src/middleware/errorHandler.js";

function run(err) {
  const res = {
    headersSent: false,
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    errorHandler(err, { method: "GET", originalUrl: "/test" }, res, () => {});
  } finally {
    console.error = originalError;
  }
  return res;
}

const prismaError = (code, meta) =>
  new Prisma.PrismaClientKnownRequestError("erreur", { code, clientVersion: "test", meta });

test("Prisma P2002 → 409, P2025 → 404, P2034 → 409", () => {
  assert.equal(run(prismaError("P2002")).statusCode, 409);
  assert.equal(run(prismaError("P2025")).statusCode, 404);
  assert.equal(run(prismaError("P2034")).statusCode, 409);
});

test("requête brute en échec de sérialisation / interblocage PostgreSQL → 409", () => {
  assert.equal(run(prismaError("P2010", { code: "40001" })).statusCode, 409);
  assert.equal(run(prismaError("P2010", { code: "40P01" })).statusCode, 409);
});

test("autre erreur Prisma ou erreur inattendue → 500 générique", () => {
  const raw = run(prismaError("P2010", { code: "42P01" }));
  assert.equal(raw.statusCode, 500);
  assert.deepEqual(raw.body, { error: "Erreur serveur" });
  assert.deepEqual(run(new Error("secret interne")).body, { error: "Erreur serveur" });
});

test("erreur métier (httpError) : statut et message conservés", () => {
  const res = run(Object.assign(new Error("Ces dates ne sont pas disponibles"), { statusCode: 409 }));
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: "Ces dates ne sont pas disponibles" });
});
