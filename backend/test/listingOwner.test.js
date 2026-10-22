import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "secret-de-test-suffisamment-long-pour-hs256-0123456789";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.DIRECT_URL = "postgresql://test:test@127.0.0.1:1/test";
process.env.NODE_ENV = "test";
process.env.STORAGE_DRIVER = "local";
process.env.EMAIL_DRIVER = "console";

const { requireListingOwner } = await import("../src/middleware/listingOwner.js");
const { default: prisma } = await import("../src/config/db.js");

function call(listing) {
  prisma.listing.findUnique = async () => listing;
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body });
        return this;
      },
    };
    requireListingOwner({ params: { id: "l1" }, user: { id: "u1" } }, res, (err) => resolve({ status: err ? 500 : 200 }));
  });
}

test("requireListingOwner : 404 si l'annonce n'existe pas, 403 si autre hôte, sinon suite", async () => {
  const missing = await call(null);
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, "Annonce introuvable");
  const other = await call({ hostId: "u2" });
  assert.equal(other.status, 403);
  assert.equal(other.body.error, "Non autorisé à modifier cette annonce");
  assert.equal((await call({ hostId: "u1" })).status, 200);
});
