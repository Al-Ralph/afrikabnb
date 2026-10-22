import React, { createContext, useContext, useState, useEffect } from "react";
import { translations, languageCodes, languageNames } from "./translations";

const STORAGE_KEY = "afrikabnb_lang";

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
