const FR_MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];
const FR_DAYS = ["D", "L", "M", "M", "J", "V", "S"];

export function getMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = first.getDay();
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

export function formatDateShort(d) {
  if (!isValidDate(d)) return "";
  const day = d.getDate();
  const month = FR_MONTHS[d.getMonth()].slice(0, 3);
  return `${day} ${month}`;
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

export { FR_MONTHS, FR_DAYS };
