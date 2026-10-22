import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "./LanguageContext";
import { formatPrice } from "../utils/format";
import { api } from "../api/client";
import {
  BASE_CURRENCY,
  SUPPORTED_CURRENCIES,
  browserHints,
  convertAmount,
  detectCurrency,
  formatConverted,
} from "../utils/currency";

// Devise d'affichage. Contrat stable utilisé par tous les composants qui affichent un prix :
//   const { currency, setCurrency, formatAmount } = useCurrency();
//   formatAmount(amount, sourceCurrency = "XOF") -> chaîne formatée dans la devise d'affichage
//   (préfixée de « ≈ » quand elle est convertie).
// Les montants restent stockés et payés dans leur devise d'origine (XOF) : seul l'affichage change.
// Compléments : currencies, isConverted(sourceCurrency), rates, ratesUpdatedAt, ratesSource,
// preference ("auto" ou code), isAuto, detectedCurrency. setCurrency("auto") revient à la détection.
const CurrencyContext = createContext(null);

export const AUTO_CURRENCY = "auto";
export const CURRENCY_STORAGE_KEY = "afrikabnb_currency";
export const RATES_STORAGE_KEY = "afrikabnb_rates";
const RATES_MAX_AGE_MS = 6 * 60 * 60 * 1000;
// Espace insécable entre « ≈ » et le montant.
const NBSP = String.fromCharCode(0xa0);

function readPreference() {
  try {
    const stored = localStorage.getItem(CURRENCY_STORAGE_KEY);
    return SUPPORTED_CURRENCIES.includes(stored) ? stored : AUTO_CURRENCY;
  } catch {
    return AUTO_CURRENCY;
  }
}

function writePreference(value) {
  try {
    if (value === AUTO_CURRENCY) localStorage.removeItem(CURRENCY_STORAGE_KEY);
    else localStorage.setItem(CURRENCY_STORAGE_KEY, value);
  } catch {
    // Stockage indisponible : la préférence vaut pour la session en cours.
  }
}

// Réponse de GET /api/rates -> { rates, updatedAt, source } (taux > 0 de la liste blanche) ou null.
function sanitizeRates(data) {
  if (!data || data.base !== BASE_CURRENCY || typeof data.rates !== "object" || data.rates === null) return null;
  const rates = {};
  for (const code of SUPPORTED_CURRENCIES) {
    const value = Number(data.rates[code]);
    if (Number.isFinite(value) && value > 0) rates[code] = value;
  }
  return { rates, updatedAt: data.updatedAt || null, source: data.source || null };
}

function readCachedRates() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(RATES_STORAGE_KEY) || "null");
    if (!cached || !(Date.now() - cached.savedAt < RATES_MAX_AGE_MS)) return null;
    return sanitizeRates(cached.data);
  } catch {
    return null;
  }
}

function writeCachedRates(data) {
  try {
    sessionStorage.setItem(RATES_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Pas de cache de session : les taux seront rechargés à la prochaine visite.
  }
}

export const CurrencyProvider = ({ children }) => {
  const { language } = useLanguage();
  const [preference, setPreference] = useState(readPreference);
  const [detectedCurrency] = useState(() => detectCurrency(browserHints()));
  const [ratesData, setRatesData] = useState(readCachedRates);
  const hadCachedRates = useRef(ratesData != null);

  // Taux chargés une fois par session ; en cas d'échec, les prix restent en devise d'origine.
  useEffect(() => {
    if (hadCachedRates.current) return undefined;
    let cancelled = false;
    api
      .getRates()
      .then((data) => {
        const clean = sanitizeRates(data);
        if (cancelled || !clean) return;
        setRatesData(clean);
        writeCachedRates(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => {
    const currency = preference === AUTO_CURRENCY ? detectedCurrency : preference;
    const rates = ratesData?.rates || null;
    const convert = (amount, source) => (source === currency ? null : convertAmount(amount, source, currency, rates));
    return {
      currency,
      setCurrency: (code) => {
        const next = code === AUTO_CURRENCY ? AUTO_CURRENCY : String(code || "").toUpperCase();
        if (next !== AUTO_CURRENCY && !SUPPORTED_CURRENCIES.includes(next)) return;
        writePreference(next);
        setPreference(next);
      },
      formatAmount: (amount, sourceCurrency = "XOF") => {
        const source = (sourceCurrency || BASE_CURRENCY).toUpperCase();
        const converted = convert(amount, source);
        // Pas de taux (pas encore chargés, devise absente) : jamais de montant faux, devise d'origine.
        if (converted == null) return formatPrice(amount, source, language);
        return `≈${NBSP}${formatConverted(converted, currency, language)}`;
      },
      isConverted: (sourceCurrency = "XOF") => convert(1, (sourceCurrency || BASE_CURRENCY).toUpperCase()) != null,
      currencies: rates ? SUPPORTED_CURRENCIES.filter((code) => rates[code] > 0 || code === BASE_CURRENCY) : SUPPORTED_CURRENCIES,
      rates,
      ratesUpdatedAt: ratesData?.updatedAt || null,
      ratesSource: ratesData?.source || null,
      preference,
      isAuto: preference === AUTO_CURRENCY,
      detectedCurrency,
    };
  }, [language, preference, detectedCurrency, ratesData]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};

// Sans fournisseur (tests de composants isolés) : affichage dans la devise d'origine, en français.
const fallback = {
  currency: BASE_CURRENCY,
  setCurrency: () => {},
  formatAmount: (amount, sourceCurrency = "XOF") => formatPrice(amount, sourceCurrency || BASE_CURRENCY, "fr"),
  isConverted: () => false,
  currencies: [BASE_CURRENCY],
  rates: null,
  ratesUpdatedAt: null,
  ratesSource: null,
  preference: AUTO_CURRENCY,
  isAuto: true,
  detectedCurrency: BASE_CURRENCY,
};

export const useCurrency = () => useContext(CurrencyContext) || fallback;
