// Logique pure (sans base de données) des réservations et des avis.
// Les dates de séjour sont des jours calendaires "YYYY-MM-DD", manipulés en UTC minuit
// (colonnes PostgreSQL DATE) pour éviter tout décalage de fuseau horaire.

const DAY_MS = 24 * 60 * 60 * 1000;

export const MAX_NIGHTS = 365;
// Plafond de DECIMAL(10, 2).
export const MAX_AMOUNT = 99999999.99;

// "YYYY-MM-DD" -> Date à 00:00 UTC.
export function parseDay(day) {
  return new Date(`${day}T00:00:00.000Z`);
}

// Date -> "YYYY-MM-DD" (UTC).
export function formatDay(date) {
  return date.toISOString().slice(0, 10);
}

// Jour courant (UTC) au format "YYYY-MM-DD".
export function todayDay(now = new Date()) {
  return formatDay(now);
}

export function addDays(day, n) {
  return formatDay(new Date(parseDay(day).getTime() + n * DAY_MS));
}

// Nombre de nuits entre deux jours "YYYY-MM-DD" (négatif si checkOut < checkIn).
export function nightsBetween(checkIn, checkOut) {
  return Math.round((parseDay(checkOut) - parseDay(checkIn)) / DAY_MS);
}

// Prix total arrondi au centime, calculé en centimes entiers (pas d'erreur d'arrondi flottant).
export function computeTotalPrice(pricePerNight, nights) {
  const cents = Math.round(Number(pricePerNight) * 100);
  return (cents * nights) / 100;
}

// Les séjours sont des intervalles semi-ouverts [checkIn, checkOut[ : un départ et une
// arrivée le même jour ne se chevauchent pas. Accepte des Date ou des "YYYY-MM-DD".
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  const t = (d) => (d instanceof Date ? d.getTime() : parseDay(d).getTime());
  return t(aStart) < t(bEnd) && t(bStart) < t(aEnd);
}

// Moyenne des notes arrondie à 2 décimales, ou null sans avis.
export function averageRating(sum, count) {
  if (!count) return null;
  return Math.round((Number(sum) / count) * 100) / 100;
}
