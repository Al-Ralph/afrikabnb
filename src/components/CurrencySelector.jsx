import React, { useEffect, useId, useRef, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { AUTO_CURRENCY, useCurrency } from "../context/CurrencyContext";
import { currencyLabel } from "../utils/currency";
import { interpolate } from "../utils/plural";
import "./LanguageSelector.css";
import "./CurrencySelector.css";

const RATES_ATTRIBUTION_URL = "https://www.exchangerate-api.com";

function formatRatesDate(iso, language) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language, { dateStyle: "long" }).format(date);
}

// Choix de la devise d'affichage (à côté du choix de langue) : bouton de divulgation + liste de
// boutons (aria-pressed), Échap ou clic extérieur pour fermer.
const CurrencySelector = () => {
  const { t, language } = useLanguage();
  const { currency, setCurrency, currencies, isAuto, detectedCurrency, ratesUpdatedAt, ratesSource } = useCurrency();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.querySelector('[aria-pressed="true"]')?.focus();
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const choose = (code) => {
    setCurrency(code);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const current = currencyLabel(currency, language);
  const date = formatRatesDate(ratesUpdatedAt, language);
  let ratesLine = t("currency.ratesPending");
  if (date) {
    ratesLine =
      ratesSource === "static"
        ? interpolate(t("currency.ratesStatic"), { date })
        : interpolate(t("currency.ratesInfo"), { source: "Exchange Rate API", date });
  }

  const option = (code, text, detail) => {
    const active = code === AUTO_CURRENCY ? isAuto : !isAuto && code === currency;
    return (
      <li key={code}>
        <button
          type="button"
          className={`language-selector-option currency-selector-option${active ? " language-selector-option--active" : ""}`}
          aria-pressed={active}
          onClick={() => choose(code)}
        >
          <span className="currency-selector-name">{text}</span>
          <span className="currency-selector-code">{detail}</span>
        </button>
      </li>
    );
  };

  return (
    <div className="language-selector currency-selector" ref={ref}>
      <button
        type="button"
        className="header-icon-btn currency-selector-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${t("currency.label")} — ${current.name} (${currency})`}
        aria-expanded={open}
        aria-controls={panelId}
        ref={triggerRef}
      >
        <span aria-hidden="true">{currency}</span>
      </button>
      {open && (
        <div
          id={panelId}
          className="language-selector-dropdown currency-selector-dropdown"
          role="group"
          aria-label={t("currency.choose")}
          ref={panelRef}
        >
          <p className="language-selector-title">{t("currency.choose")}</p>
          <ul className="language-selector-list currency-selector-list">
            {option(AUTO_CURRENCY, t("currency.auto"), detectedCurrency)}
            {currencies.map((code) => {
              const { name, symbol } = currencyLabel(code, language);
              return option(code, name, symbol && symbol !== code ? `${symbol} · ${code}` : code);
            })}
          </ul>
          <p className="currency-selector-note">
            {t("currency.note")} {ratesLine}{" "}
            <a href={RATES_ATTRIBUTION_URL} target="_blank" rel="noopener noreferrer">
              {t("currency.attribution")}
            </a>
          </p>
        </div>
      )}
    </div>
  );
};

export default CurrencySelector;
