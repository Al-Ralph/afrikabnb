import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildListingWhere,
  escapeLike,
  findListingIdsByText,
  searchText,
} from "../src/api/listings/listings.query.js";

test("aucun filtre : where vide", () => {
  assert.deepEqual(buildListingWhere({}), {});
});

test("guests filtre sur maxGuests >= guests", () => {
  assert.deepEqual(buildListingWhere({ guests: 3 }).maxGuests, { gte: 3 });
});

test("texte, catégorie et animaux", () => {
  const where = buildListingWhere({ where: "lome", categoryId: "bord-mer", pets: "1" });
  assert.deepEqual(where.OR, [
    { location: { contains: "lome", mode: "insensitive" } },
    { title: { contains: "lome", mode: "insensitive" } },
  ]);
  assert.equal(where.categoryId, "bord-mer");
  assert.equal(where.acceptsPets, true);
  assert.equal(buildListingWhere({ pets: "0" }).acceptsPets, undefined);
});

test("checkIn/checkOut excluent les réservations non annulées qui chevauchent", () => {
  const { bookings } = buildListingWhere({ checkIn: "2026-11-01", checkOut: "2026-11-05" });
  assert.deepEqual(bookings, {
    none: {
      status: { not: "CANCELLED" },
      checkIn: { lt: new Date("2026-11-05T00:00:00.000Z") },
      checkOut: { gt: new Date("2026-11-01T00:00:00.000Z") },
    },
  });
});

test("une seule date : la nuit correspondante est vérifiée", () => {
  const onlyIn = buildListingWhere({ checkIn: "2026-11-01" }).bookings.none;
  assert.deepEqual(onlyIn.checkOut, { gt: new Date("2026-11-01T00:00:00.000Z") });
  assert.deepEqual(onlyIn.checkIn, { lt: new Date("2026-11-02T00:00:00.000Z") });
  const onlyOut = buildListingWhere({ checkOut: "2026-11-05" }).bookings.none;
  assert.deepEqual(onlyOut.checkOut, { gt: new Date("2026-11-04T00:00:00.000Z") });
  assert.deepEqual(onlyOut.checkIn, { lt: new Date("2026-11-05T00:00:00.000Z") });
});

test("bornes de prix converties en Decimal", () => {
  const { pricePerNight } = buildListingWhere({ minPrice: 10, maxPrice: 200 });
  assert.equal(pricePerNight.gte.toString(), "10");
  assert.equal(pricePerNight.lte.toString(), "200");
});

test("`q` est un alias de `where` (recherche insensible à la casse PostgreSQL)", () => {
  assert.deepEqual(buildListingWhere({ q: "Lomé" }).OR, [
    { location: { contains: "Lomé", mode: "insensitive" } },
    { title: { contains: "Lomé", mode: "insensitive" } },
  ]);
});

test("textMatchIds (recherche sans accents) remplace le filtre ILIKE", () => {
  const where = buildListingWhere({ where: "Lome", pets: "1" }, { textMatchIds: ["a", "b"] });
  assert.deepEqual(where.id, { in: ["a", "b"] });
  assert.equal(where.OR, undefined);
  assert.equal(where.acceptsPets, true);
  // Aucun résultat texte : liste vide, donc aucune annonce (et non « pas de filtre »).
  assert.deepEqual(buildListingWhere({ where: "zzz" }, { textMatchIds: [] }).id, { in: [] });
});

test("searchText : `where` prioritaire, `q` en alias, vide ignoré", () => {
  assert.equal(searchText({ where: "Lomé", q: "Dakar" }), "Lomé");
  assert.equal(searchText({ q: "Dakar" }), "Dakar");
  assert.equal(searchText({ where: "" }), undefined);
});

test("escapeLike neutralise les jokers de LIKE", () => {
  assert.equal(escapeLike("100%_ok\\"), "100\\%\\_ok\\\\");
  assert.equal(escapeLike("Lomé"), "Lomé");
});

test("findListingIdsByText passe le motif échappé en paramètre (pas de concaténation SQL)", async () => {
  let captured;
  const fakePrisma = {
    $queryRaw: (strings, ...values) => {
      captured = { sql: strings.join("?"), values };
      return Promise.resolve([{ id: "x" }]);
    },
  };
  const ids = await findListingIdsByText(fakePrisma, "50%");
  assert.deepEqual(ids, ["x"]);
  assert.match(captured.sql, /unaccent\(lower\("title"\)\)/);
  assert.deepEqual(captured.values, ["%50\\%%", "%50\\%%"]);
});
