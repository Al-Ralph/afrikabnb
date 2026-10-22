import React from "react";
import { useLanguage } from "../context/LanguageContext";
import { interpolate } from "../utils/plural";
import "./GuestsPanel.css";

const ROWS = [
  { key: "adults", desc: "adultsDesc" },
  { key: "children", desc: "childrenDesc" },
  { key: "babies", desc: "babiesDesc" },
  { key: "pets", link: "petsAssistance" },
];

const GuestsPanel = ({ adults, children, babies, pets, onChange }) => {
  const { t } = useLanguage();
  const values = { adults, children, babies, pets };
  const set = (key, n) => {
    const v = Math.max(0, Number(n));
    onChange({ ...values, [key]: v });
  };

  return (
    <div className="guests-panel" role="dialog" aria-label={t("guests.dialog")}>
      {ROWS.map(({ key, desc, link }) => {
        const label = t(`guests.${key}`);
        return (
          <div key={key} className="guests-panel-row">
            <div className="guests-panel-label-wrap">
              <span className="guests-panel-label">{label}</span>
              {desc && <span className="guests-panel-desc">{t(`guests.${desc}`)}</span>}
              {link && (
                <a href="#assistance" className="guests-panel-link">
                  {t(`guests.${link}`)}
                </a>
              )}
            </div>
            <div className="guests-panel-stepper">
              <button
                type="button"
                className="guests-panel-btn"
                onClick={() => set(key, values[key] - 1)}
                disabled={values[key] <= 0}
                aria-label={interpolate(t("guests.decrease"), { label })}
              >
                −
              </button>
              <span className="guests-panel-value">{values[key]}</span>
              <button
                type="button"
                className="guests-panel-btn"
                onClick={() => set(key, values[key] + 1)}
                aria-label={interpolate(t("guests.increase"), { label })}
              >
                +
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default GuestsPanel;
