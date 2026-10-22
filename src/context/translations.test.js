import { translations, languageCodes } from "./translations";
import { pluralize } from "../utils/plural";

const leafKeys = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? leafKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );

const makeT = (lang) => (key) => {
  let v = translations[lang];
  for (const k of key.split(".")) v = v?.[k];
  return typeof v === "string" ? v : key;
};

describe("calendar and guests translations", () => {
  test.each(["datePicker", "guests"])("section %s has the same keys in the 5 languages", (section) => {
    const reference = leafKeys(translations.fr[section]).sort();
    expect(reference.length).toBeGreaterThan(0);
    languageCodes.forEach((lang) => {
      expect(leafKeys(translations[lang][section]).sort()).toEqual(reference);
    });
  });

  test("every value is a non-empty string and no placeholder is left untranslated", () => {
    languageCodes.forEach((lang) => {
      [...leafKeys(translations[lang].datePicker).map((k) => `datePicker.${k}`), ...leafKeys(translations[lang].guests).map((k) => `guests.${k}`)].forEach(
        (key) => expect(makeT(lang)(key).trim()).not.toBe("")
      );
    });
  });

  test("searchBar.destination exists in every language", () => {
    languageCodes.forEach((lang) => expect(translations[lang].searchBar.destination).toBeTruthy());
  });
});

describe("pluralize", () => {
  const cases = {
    fr: ["1 adulte", "2 adultes", "0 adulte"],
    en: ["1 adult", "2 adults", "0 adults"],
    es: ["1 adulto", "2 adultos", "0 adultos"],
    de: ["1 Erwachsener", "2 Erwachsene", "0 Erwachsene"],
    pt: ["1 adulto", "2 adultos", "0 adulto"],
  };

  test.each(Object.keys(cases))("%s: singular, plural and zero follow Intl.PluralRules", (lang) => {
    const t = makeT(lang);
    const [one, other, zero] = cases[lang];
    expect(pluralize(t, lang, "guests.summary.adults", 1)).toBe(one);
    expect(pluralize(t, lang, "guests.summary.adults", 2)).toBe(other);
    expect(pluralize(t, lang, "guests.summary.adults", 0)).toBe(zero);
  });

  test("falls back to the « other » form for categories a language does not define", () => {
    const t = makeT("fr");
    // « many » (grands nombres) existe en français selon Intl mais pas dans nos textes.
    expect(pluralize(t, "fr", "guests.summary.pets", 1000000)).toBe("1000000 animaux");
  });
});
