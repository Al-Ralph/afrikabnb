import React, { useId } from "react";
import { useDialog } from "../hooks/useDialog";
import Icon from "./Icons";
import "./Modal.css";

// Fenêtre modale générique (équipements, filtres) : en-tête titré, corps défilant, pied facultatif.
// Feuille ancrée en bas sur mobile, panneau centré sur desktop.
const Modal = ({ open, onClose, title, closeLabel, footer, children, className = "" }) => {
  const titleId = useId();
  const ref = useDialog(open, onClose);
  if (!open) return null;
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className={`modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <button type="button" className="modal-close" onClick={onClose} aria-label={closeLabel}>
            <Icon name="close" size={18} />
          </button>
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
};

export default Modal;
