import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Writable } from "node:stream";
import pino from "pino";
import pinoHttp from "pino-http";
import { redactPaths, genReqId } from "../src/config/logger.js";

// Serveur HTTP minimal avec la même configuration de masquage / d'id que l'API.
async function request(headers, status = 200) {
  const lines = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(JSON.parse(chunk.toString()));
      cb();
    },
  });
  const logger = pino({ level: "info", redact: { paths: redactPaths, censor: "[masqué]" } }, stream);
  const httpLogger = pinoHttp({
    logger,
    genReqId,
    customLogLevel: (req, res) => (res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
  });
  const server = http.createServer((req, res) => {
    httpLogger(req, res);
    res.statusCode = status;
    res.end("ok");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const res = await new Promise((resolve, reject) => {
    http.get({ port, host: "127.0.0.1", headers }, (r) => {
      r.resume();
      r.on("end", () => resolve(r));
    }).on("error", reject);
  });
  await new Promise((r) => server.close(r));
  return { res, lines };
}

test("le logger masque Authorization et les cookies", async () => {
  const { lines } = await request({ Authorization: "Bearer jeton-secret", Cookie: "sid=abc" });
  const out = JSON.stringify(lines);
  assert.ok(!out.includes("jeton-secret"));
  assert.ok(!out.includes("sid=abc"));
  assert.equal(lines[0].req.headers.authorization, "[masqué]");
});

test("X-Request-Id valide conservé, invalide remplacé, toujours renvoyé", async () => {
  const kept = await request({ "X-Request-Id": "abc-12345" });
  assert.equal(kept.res.headers["x-request-id"], "abc-12345");
  assert.equal(kept.lines[0].req.id, "abc-12345");

  const replaced = await request({ "X-Request-Id": "bad id\twith spaces" });
  assert.match(replaced.res.headers["x-request-id"], /^[0-9a-f-]{36}$/);
});

test("niveau selon le statut : 4xx warn, 5xx error", async () => {
  assert.equal((await request({}, 404)).lines[0].level, 40);
  assert.equal((await request({}, 500)).lines[0].level, 50);
  assert.equal((await request({}, 200)).lines[0].level, 30);
});
