import { useEffect, useState } from "react";
import { api } from "../api/client";

// Configuration publique des paiements (GET /api/payments/config), chargée une fois par session.
// Erreur, API absente ou réponse inattendue : paiements considérés désactivés (rien n'est affiché).
export const PAYMENTS_DISABLED = Object.freeze({ enabled: false, provider: null, currency: "XOF" });

let cached = null;

export function loadPaymentsConfig() {
  if (!cached) {
    cached = Promise.resolve()
      .then(() => api.getPaymentsConfig())
      .then((cfg) =>
        cfg && cfg.enabled === true
          ? { enabled: true, provider: String(cfg.provider || ""), currency: "XOF" }
          : PAYMENTS_DISABLED
      )
      .catch(() => {
        // Nouvel essai au prochain affichage (API momentanément injoignable).
        cached = null;
        return PAYMENTS_DISABLED;
      });
  }
  return cached;
}

// Tests : oublie la configuration mémorisée.
export function resetPaymentsConfig() {
  cached = null;
}

export function usePaymentsConfig() {
  const [config, setConfig] = useState(PAYMENTS_DISABLED);
  useEffect(() => {
    let alive = true;
    loadPaymentsConfig().then((cfg) => {
      if (alive) setConfig(cfg);
    });
    return () => {
      alive = false;
    };
  }, []);
  return config;
}
