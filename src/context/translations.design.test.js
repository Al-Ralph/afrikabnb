import { designTranslations } from "./translations.design";
import { translations, languageCodes } from "./translations";
import { mergeTranslations } from "./LanguageContext";

const flatKeys = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );

describe("translations.design", () => {
  test("every language defines exactly the same design keys as French", () => {
    const reference = flatKeys(designTranslations.fr).sort();
    for (const code of languageCodes) {
      expect(flatKeys(designTranslations[code]).sort()).toEqual(reference);
    }
  });

  test("the merge adds design keys without overwriting existing translations", () => {
    const merged = mergeTranslations(
      { home: { title: "base" }, datePicker: { tabDates: "Dates" } },
      { home: { title: "écrasé ?", extra: "nouveau" }, ui: { theme: { dark: "Sombre" } } }
    );
    expect(merged.home.title).toBe("base");
    expect(merged.home.extra).toBe("nouveau");
    expect(merged.datePicker.tabDates).toBe("Dates");
    expect(merged.ui.theme.dark).toBe("Sombre");
  });

  test("design keys do not collide with translations.js", () => {
    for (const code of languageCodes) {
      const base = new Set(flatKeys(translations[code]));
      flatKeys(designTranslations[code]).forEach((key) => expect(base.has(key)).toBe(false));
    }
  });
});
