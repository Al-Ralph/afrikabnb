import React from "react";
import "./GuestsPanel.css";

const ROWS = [
  { key: "adults", label: "Adultes", desc: "13 ans et plus" },
  { key: "children", label: "Enfants", desc: "De 2 à 12 ans" },
  { key: "babies", label: "Bébés", desc: "Moins de 2 ans" },
  { key: "pets", label: "Animaux de compagnie", desc: null, link: "Vous voyagez avec un animal d'assistance?" },
];

const GuestsPanel = ({ adults, children, babies, pets, onChange }) => {
  const values = { adults, children, babies, pets };
  const set = (key, n) => {
    const v = Math.max(0, Number(n));
    onChange({ ...values, [key]: v });
  };

  return (
    <div className="guests-panel" role="dialog" aria-label="Nombre de voyageurs">
      {ROWS.map(({ key, label, desc, link }) => (
        <div key={key} className="guests-panel-row">
          <div className="guests-panel-label-wrap">
            <span className="guests-panel-label">{label}</span>
            {desc && <span className="guests-panel-desc">{desc}</span>}
            {link && (
              <a href="#assistance" className="guests-panel-link">
                {link}
              </a>
            )}
          </div>
          <div className="guests-panel-stepper">
            <button
              type="button"
              className="guests-panel-btn"
              onClick={() => set(key, values[key] - 1)}
              disabled={values[key] <= 0}
              aria-label={`Moins de ${label}`}
            >
              −
            </button>
            <span className="guests-panel-value">{values[key]}</span>
            <button
              type="button"
              className="guests-panel-btn"
              onClick={() => set(key, values[key] + 1)}
              aria-label={`Plus de ${label}`}
            >
              +
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default GuestsPanel;
