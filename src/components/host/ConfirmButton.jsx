import React, { useState } from "react";

// Bouton d'action destructive avec confirmation en ligne (accessible, sans window.confirm).
// tone="primary" pour une action positive (accepter), "danger" par défaut.
const ConfirmButton = ({ label, prompt, confirmLabel, cancelLabel, onConfirm, className = "", tone = "danger", disabled = false }) => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return (
      <button type="button" className={className} onClick={() => setConfirming(true)} disabled={disabled}>
        {label}
      </button>
    );
  }

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <span className="host-confirm" role="group" aria-label={prompt}>
      <span className="host-confirm-prompt">{prompt}</span>
      <button type="button" className={`host-btn host-btn--${tone}`} onClick={confirm} disabled={busy}>
        {confirmLabel}
      </button>
      <button type="button" className="host-btn" onClick={() => setConfirming(false)} disabled={busy}>
        {cancelLabel}
      </button>
    </span>
  );
};

export default ConfirmButton;
