import React from "react";
import Icon from "./Icons";
import "./EmptyState.css";

// État vide illustré : pastille tonale + pictogramme au trait, titre, texte, action.
// `role` optionnel (status / alert) pour conserver la sémantique des états existants.
const EmptyState = ({ icon = "compass", title, children, action, role, compact = false, tone = "neutral" }) => (
  <div className={`empty-state${compact ? " empty-state--compact" : ""} empty-state--${tone}`} role={role}>
    <div className="empty-state-art" aria-hidden="true">
      <span className="empty-state-ring" />
      <Icon name={icon} size={compact ? 26 : 34} strokeWidth={1.5} />
    </div>
    {title && <p className="empty-state-title">{title}</p>}
    {children && <div className="empty-state-text">{children}</div>}
    {action && <div className="empty-state-action">{action}</div>}
  </div>
);

export default EmptyState;
