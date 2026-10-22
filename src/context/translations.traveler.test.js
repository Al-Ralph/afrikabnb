import { travelerTranslations } from "./translations.traveler";
import { translations, languageCodes } from "./translations";
import { AMENITIES, LISTING_SORTS } from "../api/client";

const flatKeys = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );

describe("translations.traveler", () => {
  test("every language defines exactly the same keys as French, all non-empty", () => {
    const reference = flatKeys(travelerTranslations.fr).sort();
    for (const code of languageCodes) {
      expect(flatKeys(travelerTranslations[code]).sort()).toEqual(reference);
      flatKeys(travelerTranslations[code]).forEach((key) => {
        const value = key.split(".").reduce((o, k) => o[k], travelerTranslations[code]);
        expect(typeof value === "string" && value.trim().length > 0).toBe(true);
      });
    }
  });

  test("labels every API amenity and every sort option", () => {
    for (const code of languageCodes) {
      AMENITIES.forEach((a) => expect(travelerTranslations[code].amenities[a]).toBeTruthy());
      LISTING_SORTS.forEach((s) => expect(travelerTranslations[code].sort[s]).toBeTruthy());
    }
  });

  test("traveler keys do not collide with translations.js", () => {
    for (const code of languageCodes) {
      const base = new Set(flatKeys(translations[code]));
      flatKeys(travelerTranslations[code]).forEach((key) => expect(base.has(key)).toBe(false));
    }
  });
});
