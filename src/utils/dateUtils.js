// Noms de mois / jours via Intl (aucun tableau par langue à maintenir).
function capitalize(str, locale) {
  return str.charAt(0).toLocaleUpperCase(locale) + str.slice(1);
}

export function getMonthNames(locale = "fr", style = "long") {
  const fmt = new Intl.DateTimeFormat(locale, { month: style, timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, i) => capitalize(fmt.format(new Date(Date.UTC(2021, i, 15))), locale));
}

// Premier jour de la semaine : dimanche (0) pour l'anglais, lundi (1) pour fr/es/de/pt
// (convention de ces langues) ; getMonthGrid(…, weekStart) reste cohérent avec cette valeur.
export function getWeekStart(locale = "fr") {
  return String(locale).toLowerCase().startsWith("en") ? 0 : 1;
}

// Initiales des jours, en commençant par weekStart (0 = dimanche, 1 = lundi).
export function getWeekdayLabels(locale = "fr", weekStart = getWeekStart(locale)) {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
  // 1er août 2021 = dimanche.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2021, 7, 1 + ((weekStart + i) % 7)))));
}

export function getMonthGrid(year, month, weekStart = 0) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = (first.getDay() - weekStart + 7) % 7;
  const daysInMonth = last.getDate();
  const grid = [];
  let week = Array(7).fill(null);
  let dayCount = 1;
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 7; j++) {
      const cellIndex = i * 7 + j;
      if (cellIndex < startDay) {
        week[j] = null;
      } else if (dayCount <= daysInMonth) {
        week[j] = dayCount++;
      } else {
        week[j] = null;
      }
    }
    grid.push([...week]);
    week = Array(7).fill(null);
    if (dayCount > daysInMonth) break;
  }
  return grid;
}

function isValidDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatDateShort(d, locale = "fr") {
  if (!isValidDate(d)) return "";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d);
}

export function isSameDay(a, b) {
  if (!isValidDate(a) || !isValidDate(b)) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isBefore(a, b) {
  if (!isValidDate(a) || !isValidDate(b)) return false;
  return a.getTime() < b.getTime();
}

export function isInRange(date, start, end) {
  if (!isValidDate(date) || !isValidDate(start)) return false;
  if (!isValidDate(end)) return isSameDay(date, start);
  const t = startOfDay(date);
  return t >= startOfDay(start) && t <= startOfDay(end);
}

export function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// Ajoute n mois en conservant le jour, borné au dernier jour du mois d'arrivée.
export function addMonths(d, n) {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), lastDay));
  return r;
}

// Début d'un mois { year, month } : le 1er, ou aujourd'hui si ce 1er est déjà passé (mois en cours).
export function monthStart({ year, month }, today = new Date()) {
  const first = new Date(year, month, 1);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return first < t0 ? t0 : first;
}

function stayEnd(start, duration) {
  if (duration === "week") return addDays(start, 7);
  if (duration === "month") return addMonths(start, 1);
  return addDays(start, 2); // "weekend" : 2 nuits
}

// Mode « Mois » : du début du mois choisi jusqu'à 1 semaine / 1 mois plus tard.
// duration : "weekend" | "week" | "month".
export function rangeForMonth(monthRef, duration, today = new Date()) {
  const checkIn = monthStart(monthRef, today);
  return { checkIn, checkOut: stayEnd(checkIn, duration) };
}

// Mode « Flexibles » : démarre au début du premier mois (chronologique) choisi ;
// un week-end démarre au premier vendredi à partir de cette date.
export function rangeForFlexible(months, duration, today = new Date()) {
  if (!months.length) return null;
  const first = [...months].sort((a, b) => a.year - b.year || a.month - b.month)[0];
  let checkIn = monthStart(first, today);
  if (duration === "weekend") checkIn = addDays(checkIn, (5 - checkIn.getDay() + 7) % 7);
  return { checkIn, checkOut: stayEnd(checkIn, duration) };
}

// Les `count` prochains mois, le mois courant inclus.
export function upcomingMonths(count = 12, today = new Date()) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
}

// Compatibilité : anciens exports français.
const FR_MONTHS = getMonthNames("fr");
const FR_DAYS = getWeekdayLabels("fr", 0);

export { FR_MONTHS, FR_DAYS };
