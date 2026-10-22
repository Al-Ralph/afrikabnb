// Message lisible pour une erreur de l'API : détails de validation (400) sinon message serveur.
export function apiErrorMessage(err, fallback) {
  if (Array.isArray(err?.details) && err.details.length > 0) {
    return err.details.map((d) => d.message).filter(Boolean).join(" ") || fallback;
  }
  if (err?.network) return fallback;
  return err?.message || fallback;
}
