// Fournisseur de paiement simulé (développement et tests uniquement : refusé en production par
// src/config/env.js). La page /api/payments/fake/:transactionId propose « accepté / refusé » ; le
// choix est ensuite traité par le même chemin que la notification CinetPay (vérification incluse).
import { normalizeProviderStatus } from "../../utils/payment.js";

export function createFakeProvider({ apiUrl }) {
  // transactionId -> { amount, currency, status } (mémoire du processus).
  const store = new Map();

  return {
    name: "fake",
    siteId: null,

    async initPayment({ transactionId, amount, currency }) {
      store.set(transactionId, { amount, currency, status: "WAITING_FOR_CUSTOMER" });
      return { paymentUrl: `${apiUrl}/api/payments/fake/${transactionId}`, providerRef: `FAKE-${transactionId}` };
    },

    async checkPayment(transactionId) {
      const entry = store.get(transactionId);
      if (!entry) return { status: "PENDING", rawStatus: "UNKNOWN", amount: null, currency: null, method: null, operatorId: null };
      return {
        status: normalizeProviderStatus(entry.status),
        rawStatus: entry.status,
        amount: entry.amount,
        currency: entry.currency,
        method: "FAKE",
        operatorId: entry.status === "ACCEPTED" ? `FAKE-${transactionId.slice(-8)}` : null,
      };
    },

    // outcome : "accepted" | "refused" ; amount / currency : ceux du paiement en base (le processus
    // a pu redémarrer depuis l'initialisation).
    simulate(transactionId, outcome, { amount, currency }) {
      store.set(transactionId, { amount, currency, status: outcome === "accepted" ? "ACCEPTED" : "REFUSED" });
    },

    verifyNotification() {
      return false;
    },
  };
}
