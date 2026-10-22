import React, { useState, useRef, useEffect } from "react";
import { useLanguage } from "../context/LanguageContext";
import "./LanguageSelector.css";

const GlobeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const LanguageSelector = () => {
  const { language, setLanguage, t, languageCodes, languageNames } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (code) => {
    setLanguage(code);
    setOpen(false);
  };

  return (
    <div className="language-selector" ref={ref}>
      <button
        type="button"
        className="language-selector-trigger header-icon-btn"
        onClick={() => setOpen(!open)}
        aria-label={t("header.language")}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <GlobeIcon />
      </button>
      {open && (
        <div className="language-selector-dropdown" role="menu">
          <p className="language-selector-title">{t("languageSelector.chooseLanguage")}</p>
          <ul className="language-selector-list">
            {languageCodes.map((code) => (
              <li key={code}>
                <button
                  type="button"
                  className={`language-selector-option ${language === code ? "language-selector-option--active" : ""}`}
                  onClick={() => handleSelect(code)}
                  role="menuitem"
                >
                  <span>{languageNames[code]}</span>
                  {language === code && (
                    <span className="language-selector-check" aria-hidden="true">
                      <CheckIcon />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
