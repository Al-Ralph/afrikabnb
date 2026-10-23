import { paymentTranslations } from "./translations.payment";
import { translations, languageCodes } from "./translations";
import { hostTranslations } from "./translations.host";

const flatKeys = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );

describe("translations.payment", () => {
  test("every language defines exactly the same keys as French, all non-empty", () => {
    const reference = flatKeys(paymentTranslations.fr).sort();
    for (const code of languageCodes) {
      expect(flatKeys(paymentTranslations[code]).sort()).toEqual(reference);
      flatKeys(paymentTranslations[code]).forEach((key) => {
        const value = key.split(".").reduce((o, k) => o[k], paymentTranslations[code]);
        expect(typeof value === "string" && value.trim().length > 0).toBe(true);
      });
    }
  });

  test("payment keys do not collide with existing translations", () => {
    for (const code of languageCodes) {
      const existing = new Set([...flatKeys(translations[code]), ...flatKeys(hostTranslations[code])]);
      flatKeys(paymentTranslations[code]).forEach((key) => expect(existing.has(key)).toBe(false));
    }
  });
});
