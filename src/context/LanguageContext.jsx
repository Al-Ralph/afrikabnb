import React, { createContext, useContext, useState, useEffect } from "react";
import { translations as baseTranslations, languageCodes, languageNames } from "./translations";
import { designTranslations } from "./translations.design";
import { travelerTranslations } from "./translations.traveler";
import { hostTranslations } from "./translations.host";
import { currencyTranslations } from "./translations.currency";

const STORAGE_KEY = "afrikabnb_lang";

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Fusion profonde : `extra` complète `base` sans jamais écraser une clé existante de `base`.
export function mergeTranslations(base, extra) {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra || {})) {
    if (!(key in out)) out[key] = value;
    else if (isPlainObject(out[key]) && isPlainObject(value)) out[key] = mergeTranslations(out[key], value);
  }
  return out;
}

// Calculé une fois au chargement : translations.js (prioritaire), puis les fichiers
// complémentaires (design, voyageur, hôte, devise), chacun ne pouvant qu'ajouter des clés.
const translations = [designTranslations, travelerTranslations, hostTranslations, currencyTranslations].reduce(
  mergeTranslations,
  baseTranslations
);

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && languageCodes.includes(stored)) return stored;
    const browser = navigator.language.slice(0, 2);
    return languageCodes.includes(browser) ? browser : "fr";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (code) => {
    if (languageCodes.includes(code)) setLanguageState(code);
  };

  const t = (key) => {
    const keys = key.split(".");
    let value = translations[language];
    for (const k of keys) {
      value = value?.[k];
    }
    return typeof value === "string" ? value : key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, languageCodes, languageNames }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
};
