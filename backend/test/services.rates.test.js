import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRatesService,
  CACHE_TTL_MS,
  RATES_URL,
  RETRY_AFTER_MS,
  STATIC_RATES,
  SUPPORTED_CURRENCIES,
} from "../src/services/rates.js";

const UPDATED_UNIX = 1792540800; // 2026-10-21T00:00:00Z

function apiBody(rates = {}) {
  return {
    result: "success",
    base_code: "XOF",
    time_last_update_unix: UPDATED_UNIX,
    rates: { XOF: 1, USD: 0.0018, EUR: 0.0015, XAF: 0.99, NGN: 2.7, JPY: 0.26, BTC: 1e-8, GBP: "1", ...rates },
  };
}

function fakeFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return { ok: next.status == null || next.status < 400, status: next.status ?? 200, json: async () => next.body };
  };
  return { impl, calls };
}

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

const silent = () => {
  const warnings = [];
  return { warnings, log: { warn: (msg) => warnings.push(msg) } };
};

test("succès : base XOF, date de mise à jour, source, appel avec délai d'expiration", async () => {
  const f = fakeFetch([{ body: apiBody() }]);
  const service = createRatesService({ fetchImpl: f.impl, log: silent().log });
  const data = await service.getRates();
  assert.equal(data.base, "XOF");
  assert.equal(data.source, "exchangerate-api");
  assert.equal(data.updatedAt, new Date(UPDATED_UNIX * 1000).toISOString());
  assert.equal(data.rates.USD, 0.0018);
  assert.equal(data.rates.NGN, 2.7);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, RATES_URL);
  assert.ok(f.calls[0].init.signal instanceof AbortSignal);
});

test("parités fixes exactes (EUR, XAF, XOF) et liste blanche", async () => {
  const f = fakeFetch([{ body: apiBody() }]);
  const { rates } = await createRatesService({ fetchImpl: f.impl, log: silent().log }).getRates();
  assert.equal(rates.EUR, 1 / 655.957);
  assert.equal(rates.XAF, 1);
  assert.equal(rates.XOF, 1);
  assert.equal(rates.JPY, undefined);
  assert.equal(rates.BTC, undefined);
  // Valeur non numérique ignorée.
  assert.equal(rates.GBP, undefined);
  for (const code of Object.keys(rates)) assert.ok(SUPPORTED_CURRENCIES.includes(code), code);
});

test("validation : réponse invalide ou en erreur -> table statique et avertissement", async () => {
  const cases = [
    { body: { result: "error", "error-type": "unsupported-code" } },
    { body: { ...apiBody(), base_code: "USD" } },
    { body: { ...apiBody(), time_last_update_unix: "hier" } },
    // Aucune devise non fixe exploitable.
    { body: { ...apiBody(), rates: { XOF: 1, EUR: 0.0015, USD: -1, NGN: "x", GBP: null } } },
    { status: 503, body: {} },
  ];
  for (const response of cases) {
    const { warnings, log } = silent();
    const data = await createRatesService({ fetchImpl: fakeFetch([response]).impl, log }).getRates();
    assert.equal(data.source, "static");
    assert.equal(data.updatedAt, STATIC_RATES.updatedAt);
    assert.equal(data.rates.EUR, 1 / 655.957);
    assert.equal(warnings.length, 1);
  }
});

test("cache 12 h : pas de nouvel appel avant expiration, rafraîchi ensuite", async () => {
  const c = clock();
  const f = fakeFetch([{ body: apiBody({ USD: 0.0018 }) }, { body: apiBody({ USD: 0.0019 }) }]);
  const service = createRatesService({ fetchImpl: f.impl, now: c.now, log: silent().log });
  assert.equal((await service.getRates()).rates.USD, 0.0018);
  c.advance(CACHE_TTL_MS - 1);
  assert.equal((await service.getRates()).rates.USD, 0.0018);
  assert.equal(f.calls.length, 1);
  c.advance(2);
  assert.equal((await service.getRates()).rates.USD, 0.0019);
  assert.equal(f.calls.length, 2);
});

test("échec après un succès : dernier cache conservé, nouvel essai différé", async () => {
  const c = clock();
  const { warnings, log } = silent();
  const f = fakeFetch([{ body: apiBody({ USD: 0.0018 }) }, new Error("ECONNRESET"), { body: apiBody({ USD: 0.002 }) }]);
  const service = createRatesService({ fetchImpl: f.impl, now: c.now, log });
  await service.getRates();
  c.advance(CACHE_TTL_MS);
  const stale = await service.getRates();
  assert.equal(stale.source, "exchangerate-api");
  assert.equal(stale.rates.USD, 0.0018);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /dernier cache/);
  // Pas d'appel pendant le délai de nouvel essai.
  c.advance(RETRY_AFTER_MS - 1);
  await service.getRates();
  assert.equal(f.calls.length, 2);
  c.advance(1);
  assert.equal((await service.getRates()).rates.USD, 0.002);
  assert.equal(f.calls.length, 3);
});

test("repli statique : API injoignable (délai dépassé) sans cache", async () => {
  const { warnings, log } = silent();
  const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  const data = await createRatesService({ fetchImpl: fakeFetch([timeout]).impl, log }).getRates();
  assert.equal(data.source, "static");
  assert.equal(data.rates.XAF, 1);
  assert.ok(data.rates.USD > 0);
  assert.match(warnings[0], /délai dépassé.*table statique/);
  // La table statique ne contient que des devises de la liste blanche.
  for (const code of Object.keys(STATIC_RATES.rates)) assert.ok(SUPPORTED_CURRENCIES.includes(code), code);
});

test("requêtes concurrentes mutualisées : un seul appel en vol", async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    await gate;
    return { ok: true, status: 200, json: async () => apiBody() };
  };
  const service = createRatesService({ fetchImpl, log: silent().log });
  const pending = [service.getRates(), service.getRates(), service.getRates()];
  release();
  const results = await Promise.all(pending);
  assert.equal(calls, 1);
  for (const r of results) assert.equal(r.rates.USD, 0.0018);
  // Chaque appelant reçoit sa propre copie.
  results[0].rates.USD = 42;
  assert.equal((await service.getRates()).rates.USD, 0.0018);
});
