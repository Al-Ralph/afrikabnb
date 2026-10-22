import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { MAX_CONCURRENT_UPLOADS, acquireUploadSlot, activeUploads } from "../src/middleware/uploadSlot.js";

function fakeRes() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.set = (k, v) => ((res.headers[k] = v), res);
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (body) => ((res.body = body), res);
  return res;
}

function enter() {
  const res = fakeRes();
  let passed = false;
  acquireUploadSlot({}, res, () => (passed = true));
  return { res, passed };
}

test("uploadSlot : 2 envois simultanés max, 503 au-delà, place libérée à la fermeture", () => {
  const a = enter();
  const b = enter();
  assert.ok(a.passed && b.passed);
  assert.equal(activeUploads(), MAX_CONCURRENT_UPLOADS);

  const c = enter();
  assert.equal(c.passed, false);
  assert.equal(c.res.statusCode, 503);
  assert.ok(c.res.body.error);
  assert.equal(activeUploads(), MAX_CONCURRENT_UPLOADS);

  a.res.emit("close");
  a.res.emit("close"); // décrément une seule fois
  assert.equal(activeUploads(), MAX_CONCURRENT_UPLOADS - 1);
  assert.ok(enter().passed);

  b.res.emit("close");
});
