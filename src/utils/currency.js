// Devise d'affichage : détection locale (sans réseau ni service de géolocalisation), conversion
// et formatage indicatifs. Les montants restent stockés et payés en XOF.
import { ZERO_DECIMAL } from "./format";

export const BASE_CURRENCY = "XOF";

// Même liste blanche que GET /api/rates (backend/src/services/rates.js), dans l'ordre du sélecteur.
export const SUPPORTED_CURRENCIES = [
  "XOF", "XAF", "EUR", "USD", "GBP", "CAD", "CHF",
  "NGN", "GHS", "KES", "ZAR", "MAD", "TND", "EGP",
  "RWF", "TZS", "UGX", "ETB", "GNF", "CDF", "DZD",
];

const group = (currency, countries) => Object.fromEntries(countries.map((c) => [c, currency]));

// Pays (ISO 3166-1 alpha-2) -> devise affichée.
export const COUNTRY_CURRENCY = {
  // UEMOA (franc CFA d'Afrique de l'Ouest) et CEMAC (franc CFA d'Afrique centrale).
  ...group("XOF", ["SN", "CI", "TG", "BJ", "BF", "ML", "NE", "GW"]),
  ...group("XAF", ["CM", "GA", "CG", "CF", "TD", "GQ"]),
  ...group("EUR", [
    "FR", "DE", "ES", "PT", "IT", "BE", "NL", "LU", "AT", "IE", "FI", "GR", "SK", "SI", "EE", "LV",
    "LT", "MT", "CY", "HR", "MC", "AD", "SM", "VA", "ME", "XK", "RE", "GP", "MQ", "GF", "YT", "PM",
    "BL", "MF",
  ]),
  ...group("USD", ["US", "PR", "EC", "SV", "ZW", "LR"]),
  ...group("GBP", ["GB", "IM", "JE", "GG"]),
  ...group("CHF", ["CH", "LI"]),
  CA: "CAD",
  NG: "NGN",
  GH: "GHS",
  KE: "KES",
  ZA: "ZAR",
  MA: "MAD",
  TN: "TND",
  EG: "EGP",
  RW: "RWF",
  TZ: "TZS",
  UG: "UGX",
  ET: "ETB",
  GN: "GNF",
  CD: "CDF",
  DZ: "DZD",
};

// Fuseaux africains -> pays (les fuseaux européens et américains sont traités par règle).
const AFRICA_TIMEZONE_COUNTRY = {
  "Africa/Lome": "TG",
  "Africa/Dakar": "SN",
  "Africa/Abidjan": "CI",
  "Africa/Porto-Novo": "BJ",
  "Africa/Ouagadougou": "BF",
  "Africa/Bamako": "ML",
  "Africa/Niamey": "NE",
  "Africa/Bissau": "GW",
  "Africa/Douala": "CM",
  "Africa/Libreville": "GA",
  "Africa/Brazzaville": "CG",
  "Africa/Bangui": "CF",
  "Africa/Ndjamena": "TD",
  "Africa/Malabo": "GQ",
  "Africa/Lagos": "NG",
  "Africa/Accra": "GH",
  "Africa/Nairobi": "KE",
  "Africa/Johannesburg": "ZA",
  "Africa/Casablanca": "MA",
  "Africa/El_Aaiun": "MA",
  "Africa/Tunis": "TN",
  "Africa/Cairo": "EG",
  "Africa/Kigali": "RW",
  "Africa/Dar_es_Salaam": "TZ",
  "Africa/Kampala": "UG",
  "Africa/Addis_Ababa": "ET",
  "Africa/Conakry": "GN",
  "Africa/Kinshasa": "CD",
  "Africa/Lubumbashi": "CD",
  "Africa/Algiers": "DZ",
  "Africa/Ceuta": "ES",
};

const GBP_ZONES = new Set(["Europe/London", "Europe/Guernsey", "Europe/Jersey", "Europe/Isle_of_Man"]);
const CHF_ZONES = new Set(["Europe/Zurich", "Europe/Vaduz", "Europe/Busingen"]);
const CAD_ZONES = new Set([
  "America/Toronto", "America/Montreal", "America/Vancouver", "America/Edmonton", "America/Winnipeg",
  "America/Halifax", "America/St_Johns", "America/Regina", "America/Moncton", "America/Whitehorse",
  "America/Yellowknife", "America/Iqaluit",
]);

// Région d'une étiquette de langue BCP 47 ("fr-SN", "zh-Hant-TW", "en_GB") ; null sans région.
export function regionOfLocale(tag) {
  const match = /^[a-z]{2,3}(?:[-_][a-z]{4})?[-_]([a-z]{2})(?:[-_]|$)/i.exec(String(tag || ""));
  return match ? match[1].toUpperCase() : null;
}

export function currencyForCountry(country) {
  return COUNTRY_CURRENCY[String(country || "").toUpperCase()] || null;
}

// Devise d'un fuseau IANA : Afrique par pays, Europe -> EUR (sauf Royaume-Uni et Suisse),
// Canada -> CAD, reste de l'Amérique et Hawaï -> USD ; null si inconnu.
export function currencyForTimeZone(timeZone) {
  const tz = String(timeZone || "");
  if (AFRICA_TIMEZONE_COUNTRY[tz]) return currencyForCountry(AFRICA_TIMEZONE_COUNTRY[tz]);
  if (GBP_ZONES.has(tz)) return "GBP";
  if (CHF_ZONES.has(tz)) return "CHF";
  if (tz.startsWith("Europe/") || tz === "Atlantic/Canary" || tz === "Atlantic/Madeira" || tz === "Atlantic/Azores") return "EUR";
  if (CAD_ZONES.has(tz)) return "CAD";
  if (tz.startsWith("America/") || tz === "Pacific/Honolulu") return "USD";
  if (tz === "Indian/Reunion" || tz === "Indian/Mayotte") return "EUR";
  return null;
}

// Ordre : région des langues du navigateur, puis fuseau horaire, puis XOF.
export function detectCurrency({ languages = [], timeZone } = {}) {
  for (const tag of languages) {
    const currency = currencyForCountry(regionOfLocale(tag));
    if (currency && SUPPORTED_CURRENCIES.includes(currency)) return currency;
  }
  const fromZone = currencyForTimeZone(timeZone);
  if (fromZone && SUPPORTED_CURRENCIES.includes(fromZone)) return fromZone;
  return BASE_CURRENCY;
}

// Indices du navigateur (aucun appel réseau) ; protégé pour les environnements sans Intl/navigator.
export function browserHints() {
  let timeZone;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timeZone = undefined;
  }
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const languages = Array.isArray(nav.languages) && nav.languages.length ? nav.languages : [nav.language].filter(Boolean);
  return { languages, timeZone };
}

// Montant converti entre deux devises à partir des taux { CODE: unités pour 1 XOF } ;
// null si un taux manque (l'appelant affiche alors la devise d'origine).
export function convertAmount(amount, from, to, rates) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  if (from === to) return value;
  const rateOf = (code) => (code === BASE_CURRENCY ? 1 : rates?.[code]);
  const rFrom = rateOf(from);
  const rTo = rateOf(to);
  if (!(rFrom > 0) || !(rTo > 0)) return null;
  return (value / rFrom) * rTo;
}

// Montant converti : jamais de décimales pour les devises sans sous-unité ni à partir de 100
// (évite une fausse précision), sinon les décimales usuelles de la devise.
export function formatConverted(value, currency, locale = "fr") {
  try {
    const defaults = new Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions();
    const digits = ZERO_DECIMAL.has(currency) || Math.abs(value) >= 100 ? 0 : defaults.maximumFractionDigits;
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${Math.round(value)} ${currency}`;
  }
}

// Nom localisé ("Euro") et symbole ("€") d'une devise.
export function currencyLabel(code, locale = "fr") {
  let name = code;
  let symbol = code;
  try {
    name = new Intl.DisplayNames([locale], { type: "currency" }).of(code) || code;
  } catch {
    // Intl.DisplayNames indisponible : code ISO.
  }
  try {
    const parts = new Intl.NumberFormat(locale, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0);
    symbol = parts.find((p) => p.type === "currency")?.value || code;
  } catch {
    // Symbole inconnu : code ISO.
  }
  return { name, symbol };
}
