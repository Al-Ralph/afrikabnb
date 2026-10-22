import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  AMENITIES,
  buildListingWhere,
  escapeLike,
  findListingIdsByText,
  listingFilterFields,
  listingOrderBy,
  searchText,
} from "../src/api/listings/listings.query.js";

test("aucun filtre : uniquement les annonces publiques (ACTIVE)", () => {
  assert.deepEqual(buildListingWhere({}), { status: "ACTIVE" });
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

test("checkIn/checkOut excluent les réservations bloquantes et les dates bloquées qui chevauchent", () => {
  const now = new Date("2026-10-22T12:00:00.000Z");
  const { bookings, blockedPeriods } = buildListingWhere(
    { checkIn: "2026-11-01", checkOut: "2026-11-05" },
    { now }
  );
  assert.deepEqual(bookings, {
    none: {
      OR: [
        { status: "CONFIRMED" },
        {
          status: "PENDING",
          createdAt: { gt: new Date("2026-10-20T12:00:00.000Z") },
          checkIn: { gte: new Date("2026-10-22T00:00:00.000Z") },
        },
      ],
      checkIn: { lt: new Date("2026-11-05T00:00:00.000Z") },
      checkOut: { gt: new Date("2026-11-01T00:00:00.000Z") },
    },
  });
  assert.deepEqual(blockedPeriods, {
    none: {
      startDate: { lt: new Date("2026-11-05T00:00:00.000Z") },
      endDate: { gt: new Date("2026-11-01T00:00:00.000Z") },
    },
  });
});

test("amenities : toutes requises (hasEvery), validation de la query", () => {
  assert.deepEqual(buildListingWhere({ amenities: ["WIFI", "POOL"] }).amenities, { hasEvery: ["WIFI", "POOL"] });
  assert.equal(buildListingWhere({ amenities: [] }).amenities, undefined);
  const schema = z.object(listingFilterFields);
  assert.deepEqual(schema.parse({ amenities: "wifi, POOL,WIFI" }).amenities, ["WIFI", "POOL"]);
  assert.equal(schema.safeParse({ amenities: "WIFI,JACUZZI_DOR" }).success, false);
  assert.ok(AMENITIES.includes("GENERATOR") && AMENITIES.includes("WATER_TANK") && AMENITIES.includes("SECURITY"));
});

test("sort : défaut recommended, valeurs inconnues refusées, orderBy stable", () => {
  const schema = z.object(listingFilterFields);
  assert.equal(schema.parse({}).sort, "recommended");
  assert.equal(schema.safeParse({ sort: "random" }).success, false);
  assert.deepEqual(listingOrderBy("price_asc"), [{ pricePerNight: "asc" }, { id: "asc" }]);
  assert.deepEqual(listingOrderBy("price_desc")[0], { pricePerNight: "desc" });
  assert.deepEqual(listingOrderBy("rating_desc")[0], { rating: { sort: "desc", nulls: "last" } });
  assert.deepEqual(listingOrderBy(), [{ createdAt: "desc" }, { id: "asc" }]);
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
