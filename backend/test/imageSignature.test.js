import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { detectImageType } from "../src/utils/imageSignature.js";

const pad = (bytes) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(16)]);
const riff = (fourcc) => Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from(fourcc), Buffer.alloc(8)]);

test("signatures JPEG, PNG et WebP reconnues", () => {
  assert.equal(detectImageType(pad([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(detectImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(detectImageType(riff("WEBP")), "image/webp");
});

test("fichiers non-image ou déguisés refusés", () => {
  assert.equal(detectImageType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), null);
  assert.equal(detectImageType(Buffer.from("GIF89a............")), null);
  assert.equal(detectImageType(Buffer.from("%PDF-1.7 ............")), null);
  // RIFF non WebP (WAV)
  assert.equal(detectImageType(riff("WAVE")), null);
  assert.equal(detectImageType(Buffer.alloc(0)), null);
  assert.equal(detectImageType(null), null);
  assert.equal(detectImageType(Buffer.from([0xff, 0xd8])), null);
});

test("images réelles produites par sharp reconnues", async () => {
  const base = sharp({ create: { width: 4, height: 4, channels: 3, background: "#0b5d46" } });
  assert.equal(detectImageType(await base.clone().jpeg().toBuffer()), "image/jpeg");
  assert.equal(detectImageType(await base.clone().png().toBuffer()), "image/png");
  assert.equal(detectImageType(await base.clone().webp().toBuffer()), "image/webp");
});
