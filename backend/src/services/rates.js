// Taux de change pour l'affichage indicatif des prix (les montants restent stockés et payés en XOF).
// Source : open.er-api.com (gratuit, sans clé, mis à jour une fois par jour ; attribution
// « Rates By Exchange Rate API » obligatoire côté interface). Cache mémoire 12 h, une seule requête
// en vol à la fois, repli sur le dernier cache puis sur une table statique datée : ne lève jamais.
import { z } from "zod";
import { logger } from "../config/logger.js";

export const RATES_URL = "https://open.er-api.com/v6/latest/XOF";
export const BASE_CURRENCY = "XOF";
export const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
// Après un échec : pas de nouvel appel à l'API avant ce délai (évite une requête par visiteur).
export const RETRY_AFTER_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 5000;

// Devises proposées à l'affichage (rates[X] = combien de X pour 1 XOF).
export const SUPPORTED_CURRENCIES = [
  "XOF", "XAF", "EUR", "USD", "GBP", "CAD", "CHF",
  "NGN", "GHS", "KES", "ZAR", "MAD", "TND", "EGP",
  "RWF", "TZS", "UGX", "ETB", "GNF", "CDF", "DZD",
];

// Parités fixes exactes : 1 EUR = 655,957 XOF ; XOF et XAF sont à parité (1 pour 1).
const FIXED_RATES = { XOF: 1, XAF: 1, EUR: 1 / 655.957 };

// Table de secours embarquée (valeurs approximatives, datées) si l'API n'a jamais répondu.
export const STATIC_RATES = Object.freeze({
  updatedAt: "2026-10-01T00:00:00.000Z",
  rates: Object.freeze({
    ...FIXED_RATES,
    USD: 0.00177,
    GBP: 0.00133,
    CAD: 0.00245,
    CHF: 0.00142,
    NGN: 2.65,
    GHS: 0.0212,
    KES: 0.228,
    ZAR: 0.0309,
    MAD: 0.0161,
    TND: 0.00513,
    EGP: 0.0849,
    RWF: 2.55,
    TZS: 4.33,
    UGX: 6.36,
    ETB: 0.248,
    GNF: 15.3,
    CDF: 5.04,
    DZD: 0.23,
  }),
});

const rate = z.number().positive().finite();
const apiSchema = z.object({
  result: z.literal("success"),
  base_code: z.literal(BASE_CURRENCY),
  time_last_update_unix: z.number().int().positive(),
  rates: z.record(z.string(), z.unknown()),
});

// Liste blanche + parités fixes ; une valeur non numérique / négative est ignorée.
export function pickRates(raw) {
  const rates = {};
  for (const code of SUPPORTED_CURRENCIES) {
    if (code in FIXED_RATES) rates[code] = FIXED_RATES[code];
    else if (rate.safeParse(raw?.[code]).success) rates[code] = raw[code];
  }
  return rates;
}

function snapshot(entry) {
  return { base: BASE_CURRENCY, rates: { ...entry.rates }, updatedAt: entry.updatedAt, source: entry.source };
}

export function createRatesService({ fetchImpl = (...args) => globalThis.fetch(...args), now = Date.now, log = logger } = {}) {
  let cache = null; // { rates, updatedAt, source, expiresAt }
  let inflight = null;

  async function fetchLatest() {
    const res = await fetchImpl(RATES_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = apiSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error("réponse invalide");
    const rates = pickRates(parsed.data.rates);
    // Au moins une devise non fixe, sinon la réponse n'apporte rien.
    if (!Object.keys(rates).some((code) => !(code in FIXED_RATES))) throw new Error("aucune devise utile");
    return {
      rates,
      updatedAt: new Date(parsed.data.time_last_update_unix * 1000).toISOString(),
      source: "exchangerate-api",
    };
  }

  async function refresh() {
    try {
      cache = { ...(await fetchLatest()), expiresAt: now() + CACHE_TTL_MS };
    } catch (err) {
      log.warn(`[rates] taux indisponibles (${err?.name === "TimeoutError" ? "délai dépassé" : err?.message}) : repli sur ${cache ? "le dernier cache" : "la table statique"}`);
      const fallback = cache || { ...STATIC_RATES, source: "static" };
      cache = { ...fallback, expiresAt: now() + RETRY_AFTER_MS };
    }
    return snapshot(cache);
  }

  async function getRates() {
    if (cache && now() < cache.expiresAt) return snapshot(cache);
    if (!inflight) inflight = refresh().finally(() => (inflight = null));
    return inflight;
  }

  return { getRates };
}

const service = createRatesService();
export const getRates = () => service.getRates();
