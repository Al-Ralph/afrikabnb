import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// env.js est figé à l'import : chaque configuration est évaluée dans un processus séparé.
// Toutes les variables lues sont fournies explicitement (dotenv n'écrase pas l'environnement).
const backendDir = fileURLToPath(new URL("..", import.meta.url));
const base = {
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot,
  DATABASE_URL: "postgresql://t:t@localhost:5432/t",
  DIRECT_URL: "postgresql://t:t@localhost:5432/t",
  JWT_SECRET: "secret-de-test-suffisamment-long-pour-hs256-0123456789",
  APP_URL: "https://app.example",
  STORAGE_DRIVER: "local",
  STORAGE_ALLOW_LOCAL: "1",
  EMAIL_DRIVER: "console",
  CORS_ORIGIN: "http://localhost:3000",
  JWT_EXPIRES_IN: "",
  JWT_ACCESS_TTL: "",
  REFRESH_TTL_DAYS: "",
  COOKIE_SECURE: "",
};

function loadConfig(env) {
  const out = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", "const { config } = await import('./src/config/env.js'); console.log(JSON.stringify(config));"],
    { cwd: backendDir, env: { ...base, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  return JSON.parse(out.trim().split("\n").pop());
}

test("config : cookie Secure en production ou avec COOKIE_SECURE=true, pas en développement", () => {
  assert.equal(loadConfig({ NODE_ENV: "development" }).session.cookieSecure, false);
  assert.equal(loadConfig({ NODE_ENV: "development", COOKIE_SECURE: "true" }).session.cookieSecure, true);
  assert.equal(loadConfig({ NODE_ENV: "production", CORS_ORIGIN: "https://app.example" }).session.cookieSecure, true);
});

test("config : jeton d'accès 15m et renouvellement 30 jours par défaut, surchargeables", () => {
  const def = loadConfig({ NODE_ENV: "development" });
  assert.equal(def.jwt.expiresIn, "15m");
  assert.equal(def.session.refreshTtlDays, 30);
  const custom = loadConfig({ NODE_ENV: "development", JWT_ACCESS_TTL: "5m", REFRESH_TTL_DAYS: "7" });
  assert.equal(custom.jwt.expiresIn, "5m");
  assert.equal(custom.session.refreshTtlDays, 7);
});

test("config : jamais d'origine CORS \"*\" (credentials) ; valeurs invalides refusées", () => {
  assert.deepEqual(
    loadConfig({ NODE_ENV: "development", CORS_ORIGIN: "*,http://localhost:3000" }).corsOrigins,
    ["http://localhost:3000"]
  );
  assert.deepEqual(loadConfig({ NODE_ENV: "development", CORS_ORIGIN: "*" }).corsOrigins, ["http://localhost:3000"]);
  assert.throws(() => loadConfig({ NODE_ENV: "production", CORS_ORIGIN: "*" }));
  assert.throws(() => loadConfig({ NODE_ENV: "development", REFRESH_TTL_DAYS: "0" }));
  assert.throws(() => loadConfig({ NODE_ENV: "development", JWT_ACCESS_TTL: "2 days" }));
});
