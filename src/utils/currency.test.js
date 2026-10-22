import {
  COUNTRY_CURRENCY,
  SUPPORTED_CURRENCIES,
  convertAmount,
  currencyForCountry,
  currencyForTimeZone,
  currencyLabel,
  detectCurrency,
  formatConverted,
  regionOfLocale,
} from "./currency";

const norm = (s) => s.replace(/\s/g, " ");

describe("regionOfLocale", () => {
  test.each([
    ["fr-SN", "SN"],
    ["en_GB", "GB"],
    ["zh-Hant-TW", "TW"],
    ["pt-PT-u-nu-latn", "PT"],
    ["fr", null],
    ["es-419", null],
    ["", null],
    [undefined, null],
  ])("%s -> %s", (tag, region) => {
    expect(regionOfLocale(tag)).toBe(region);
  });
});

describe("table pays -> devise", () => {
  test.each([
    ["SN", "XOF"], ["CI", "XOF"], ["TG", "XOF"], ["BJ", "XOF"], ["BF", "XOF"], ["ML", "XOF"], ["NE", "XOF"],
    ["CM", "XAF"], ["GA", "XAF"], ["NG", "NGN"], ["GH", "GHS"], ["KE", "KES"], ["ZA", "ZAR"], ["MA", "MAD"],
    ["FR", "EUR"], ["DE", "EUR"], ["ES", "EUR"], ["PT", "EUR"], ["US", "USD"], ["GB", "GBP"], ["CA", "CAD"],
    ["CH", "CHF"], ["RW", "RWF"], ["CD", "CDF"], ["DZ", "DZD"], ["sn", "XOF"],
  ])("%s -> %s", (country, currency) => {
    expect(currencyForCountry(country)).toBe(currency);
  });

  test("pays inconnu -> null ; toutes les devises de la table sont proposées", () => {
    expect(currencyForCountry("JP")).toBeNull();
    expect(currencyForCountry(null)).toBeNull();
    for (const currency of Object.values(COUNTRY_CURRENCY)) expect(SUPPORTED_CURRENCIES).toContain(currency);
  });
});

describe("currencyForTimeZone", () => {
  test.each([
    ["Africa/Lome", "XOF"], ["Africa/Dakar", "XOF"], ["Africa/Abidjan", "XOF"], ["Africa/Douala", "XAF"],
    ["Africa/Lagos", "NGN"], ["Africa/Accra", "GHS"], ["Africa/Nairobi", "KES"], ["Africa/Johannesburg", "ZAR"],
    ["Africa/Casablanca", "MAD"], ["Europe/Paris", "EUR"], ["Europe/Berlin", "EUR"], ["Europe/London", "GBP"],
    ["Europe/Zurich", "CHF"], ["America/New_York", "USD"], ["America/Los_Angeles", "USD"], ["America/Toronto", "CAD"],
    ["Asia/Tokyo", null], ["", null], [undefined, null],
  ])("%s -> %s", (tz, currency) => {
    expect(currencyForTimeZone(tz)).toBe(currency);
  });
});

describe("detectCurrency", () => {
  test("la région de la première langue reconnue l'emporte sur le fuseau", () => {
    expect(detectCurrency({ languages: ["fr-SN", "fr"], timeZone: "Europe/Paris" })).toBe("XOF");
    expect(detectCurrency({ languages: ["en-NG"], timeZone: "Africa/Lome" })).toBe("NGN");
    expect(detectCurrency({ languages: ["fr-CA"], timeZone: "Africa/Lome" })).toBe("CAD");
    expect(detectCurrency({ languages: ["fr-CM"] })).toBe("XAF");
    expect(detectCurrency({ languages: ["ar-MA"] })).toBe("MAD");
    expect(detectCurrency({ languages: ["ja-JP", "en-GB"] })).toBe("GBP");
  });

  test("langue sans région : fuseau horaire, puis XOF", () => {
    expect(detectCurrency({ languages: ["fr", "en"], timeZone: "Africa/Accra" })).toBe("GHS");
    expect(detectCurrency({ languages: ["de"], timeZone: "Europe/Zurich" })).toBe("CHF");
    expect(detectCurrency({ languages: ["fr"], timeZone: "Asia/Tokyo" })).toBe("XOF");
    expect(detectCurrency()).toBe("XOF");
  });
});

describe("conversion et formatage", () => {
  const rates = { EUR: 1 / 655.957, USD: 0.0018, XAF: 1, NGN: 2.7 };

  test("convertAmount depuis XOF, entre deux devises, et null sans taux", () => {
    expect(convertAmount(655957, "XOF", "EUR", rates)).toBeCloseTo(1000, 6);
    expect(convertAmount(1000, "EUR", "XOF", rates)).toBeCloseTo(655957, 3);
    expect(convertAmount(100, "EUR", "USD", rates)).toBeCloseTo(100 * 655.957 * 0.0018, 6);
    expect(convertAmount(5000, "XOF", "XOF", rates)).toBe(5000);
    expect(convertAmount(5000, "XOF", "GBP", rates)).toBeNull();
    expect(convertAmount(5000, "XOF", "EUR", null)).toBeNull();
    expect(convertAmount("abc", "XOF", "EUR", rates)).toBeNull();
  });

  test("formatConverted : unités au-delà de 100, décimales sinon, jamais pour les devises sans sous-unité", () => {
    expect(norm(formatConverted(1234.56, "EUR", "fr"))).toBe("1 235 €");
    expect(norm(formatConverted(38.1234, "EUR", "fr"))).toBe("38,12 €");
    expect(formatConverted(38.1234, "USD", "en")).toBe("$38.12");
    expect(norm(formatConverted(52.6, "XAF", "fr"))).toMatch(/^53 /);
  });

  test("currencyLabel : nom localisé et symbole", () => {
    expect(currencyLabel("EUR", "fr")).toEqual({ name: "euro", symbol: "€" });
    expect(currencyLabel("USD", "en").symbol).toBe("$");
    expect(currencyLabel("USD", "en").name).toMatch(/US Dollar/i);
  });
});
