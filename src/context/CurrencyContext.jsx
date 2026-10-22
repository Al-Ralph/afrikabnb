import React, { createContext, useContext } from "react";
import { useLanguage } from "./LanguageContext";
import { formatPrice } from "../utils/format";

// Devise d'affichage. Contrat stable utilisé par tous les composants qui affichent un prix :
//   const { currency, setCurrency, formatAmount } = useCurrency();
//   formatAmount(amount, sourceCurrency = "XOF") -> chaîne formatée dans la devise d'affichage.
// Les montants restent stockés et payés dans leur devise d'origine (XOF) : seule l'affichage change.
const CurrencyContext = createContext(null);

export const CurrencyProvider = ({ children }) => {
  const { language } = useLanguage();
  const value = {
    currency: "XOF",
    setCurrency: () => {},
    formatAmount: (amount, sourceCurrency = "XOF") => formatPrice(amount, sourceCurrency, language),
  };
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};

// Sans fournisseur (tests de composants isolés) : affichage dans la devise d'origine, en français.
const fallback = {
  currency: "XOF",
  setCurrency: () => {},
  formatAmount: (amount, sourceCurrency = "XOF") => formatPrice(amount, sourceCurrency, "fr"),
};

export const useCurrency = () => useContext(CurrencyContext) || fallback;
