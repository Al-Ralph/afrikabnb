// Redirection vers la page du prestataire de paiement (navigation complète, hors application).
// Module séparé : remplacé par un simulacre dans les tests (jsdom n'implémente pas la navigation).
export function goToPayment(url) {
  window.location.assign(url);
}
