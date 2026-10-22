import { hostTranslations } from "./translations.host";
import { translations, languageCodes } from "./translations";

const flatKeys = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );

const valueAt = (obj, key) => key.split(".").reduce((o, k) => o?.[k], obj);

describe("translations.host", () => {
  test("every language defines exactly the same host / admin / dashboard keys as French", () => {
    const reference = flatKeys(hostTranslations.fr).sort();
    expect(reference.length).toBeGreaterThan(100);
    for (const code of languageCodes) {
      expect(flatKeys(hostTranslations[code]).sort()).toEqual(reference);
    }
  });

  test("every value is a non-empty string", () => {
    for (const code of languageCodes) {
      flatKeys(hostTranslations[code]).forEach((key) => {
        const value = valueAt(hostTranslations[code], key);
        expect(typeof value).toBe("string");
        expect(value.trim()).not.toBe("");
      });
    }
  });

  test("host keys only add new entries (no collision with translations.js)", () => {
    for (const code of languageCodes) {
      const base = new Set(flatKeys(translations[code]));
      flatKeys(hostTranslations[code]).forEach((key) => expect(base.has(key)).toBe(false));
    }
  });
});
