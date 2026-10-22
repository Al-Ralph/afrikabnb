// Formatage partagé (cartes, fiche, profil, espace hôte, carte) : montants, jours "YYYY-MM-DD", nuits.

// Devises sans sous-unité affichée (francs CFA…).
const ZERO_DECIMAL = new Set(["XOF", "XAF", "JPY", "KRW", "GNF", "RWF", "UGX", "BIF", "DJF", "KMF"]);

export function formatPrice(amount, currency = "XOF", locale = "fr") {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";
  const code = (currency || "XOF").toUpperCase();
  const zero = ZERO_DECIMAL.has(code);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: zero || Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: zero ? 0 : 2,
    }).format(value);
  } catch {
    // Code devise inconnu de Intl : affichage simple.
    return `${value} ${code}`;
  }
}

// "YYYY-MM-DD" -> Date (jour local, évite le décalage UTC de new Date("YYYY-MM-DD")) ; null si invalide.
export function parseIsoDay(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function formatDay(value, locale = "fr") {
  const date = value instanceof Date ? value : parseIsoDay(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

// Nombre de nuits entre deux jours (Date locale ou "YYYY-MM-DD") ; 0 si incomplet.
export function nightsBetween(checkIn, checkOut) {
  const a = checkIn instanceof Date ? checkIn : parseIsoDay(checkIn);
  const b = checkOut instanceof Date ? checkOut : parseIsoDay(checkOut);
  if (!a || !b) return 0;
  const utc = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, Math.round((utc(b) - utc(a)) / 86400000));
}
