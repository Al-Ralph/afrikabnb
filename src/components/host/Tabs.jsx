import React, { useRef } from "react";
import "./Tabs.css";

// Onglets accessibles (motif ARIA tablist) : flèches gauche/droite, Début/Fin, activation au focus.
// tabs : [{ id, label, badge? }] ; le panneau associé est rendu par <TabPanel>.
const Tabs = ({ tabs, active, onChange, label, idPrefix }) => {
  const refs = useRef({});

  const onKeyDown = (e) => {
    const index = tabs.findIndex((tab) => tab.id === active);
    let next = null;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next == null) return;
    e.preventDefault();
    const id = tabs[next].id;
    onChange(id);
    refs.current[id]?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            className={`tabs-tab${selected ? " tabs-tab--active" : ""}`}
            onClick={() => onChange(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.badge ? (
              <span className="tabs-badge">
                {tab.badge.count}
                <span className="sr-only"> {tab.badge.label}</span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};

export const TabPanel = ({ idPrefix, id, children }) => (
  <div
    role="tabpanel"
    id={`${idPrefix}-panel-${id}`}
    aria-labelledby={`${idPrefix}-tab-${id}`}
    tabIndex={0}
    className="tabs-panel"
  >
    {children}
  </div>
);

export default Tabs;
