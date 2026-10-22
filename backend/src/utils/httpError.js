// Erreur HTTP métier : le errorHandler renvoie `statusCode` et le message (si < 500).
export function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}
