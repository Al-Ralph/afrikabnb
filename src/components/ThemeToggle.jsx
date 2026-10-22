import React, { useEffect, useRef, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { interpolate } from "../utils/plural";
import "./ThemeToggle.css";

export const THEME_STORAGE_KEY = "afrikabnb_theme";
export const THEME_MODES = ["light", "dark", "system"];

// Lecture / écriture protégées : stockage indisponible (navigation privée, iframe…) = mode système.
export function readThemeMode() {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

// Applique le mode : "system" retire data-theme et laisse prefers-color-scheme décider (CSS).
export function applyThemeMode(mode) {
  const root = document.documentElement;
  if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode);
  else root.removeAttribute("data-theme");
  try {
    if (mode === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Choix non mémorisé : appliqué pour la session seulement.
  }
}

const svgProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: "false",
};

const SunIcon = () => (
  <svg {...svgProps}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
  </svg>
);

const MoonIcon = () => (
  <svg {...svgProps}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </svg>
);

const SystemIcon = () => (
  <svg {...svgProps}>
    <rect x="3" y="4" width="18" height="12.5" rx="2" />
    <path d="M8.5 20.5h7M12 16.5v4" />
  </svg>
);

const ICONS = { light: SunIcon, dark: MoonIcon, system: SystemIcon };

const ThemeToggle = () => {
  const { t } = useLanguage();
  const [mode, setMode] = useState(readThemeMode);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (next) => {
    applyThemeMode(next);
    setMode(next);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const Icon = ICONS[mode];
  const currentLabel = interpolate(t("ui.theme.current"), { mode: t(`ui.theme.${mode}`) });

  return (
    <div className="theme-toggle" ref={ref}>
      <button
        type="button"
        className="theme-toggle-trigger header-icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={currentLabel}
        aria-expanded={open}
        aria-controls="theme-toggle-menu"
        ref={triggerRef}
      >
        <Icon />
      </button>
      {open && (
        <div className="theme-toggle-menu" id="theme-toggle-menu" role="group" aria-label={t("ui.theme.label")}>
          {THEME_MODES.map((m) => {
            const ItemIcon = ICONS[m];
            return (
              <button
                key={m}
                type="button"
                className={`theme-toggle-option${mode === m ? " theme-toggle-option--active" : ""}`}
                aria-pressed={mode === m}
                onClick={() => choose(m)}
              >
                <ItemIcon />
                <span>{t(`ui.theme.${m}`)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ThemeToggle;
