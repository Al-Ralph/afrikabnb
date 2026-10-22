import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { errorHandler } from "../src/middleware/errorHandler.js";

function run(err, logged = []) {
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
  const req = {
    id: "req-test-1234",
    method: "GET",
    originalUrl: "/test",
    log: { error: (...args) => logged.push(args) },
  };
  errorHandler(err, req, res, () => {});
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
  assert.deepEqual(raw.body, { error: "Erreur serveur", requestId: "req-test-1234" });
  assert.deepEqual(run(new Error("secret interne")).body, {
    error: "Erreur serveur",
    requestId: "req-test-1234",
  });
});

test("5xx : erreur complète journalisée avec l'id de requête, jamais renvoyée au client", () => {
  const logged = [];
  const res = run(new Error("secret interne"), logged);
  assert.equal(logged.length, 1);
  assert.equal(logged[0][0].err.message, "secret interne");
  assert.equal(logged[0][0].reqId, "req-test-1234");
  assert.ok(!JSON.stringify(res.body).includes("secret interne"));
});

test("4xx : pas de journal d'erreur", () => {
  const logged = [];
  run(Object.assign(new Error("Non autorisé"), { statusCode: 401 }), logged);
  assert.equal(logged.length, 0);
});

test("erreur métier (httpError) : statut et message conservés", () => {
  const res = run(Object.assign(new Error("Ces dates ne sont pas disponibles"), { statusCode: 409 }));
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: "Ces dates ne sont pas disponibles" });
});
