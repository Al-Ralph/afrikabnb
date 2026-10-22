import React, { useState } from "react";
import {
  getMonthGrid,
  getMonthNames,
  getWeekStart,
  getWeekdayLabels,
  formatDateShort,
  rangeForMonth,
  rangeForFlexible,
  upcomingMonths,
  isSameDay,
  isBefore,
  isInRange,
} from "../utils/dateUtils";
import { pluralize, interpolate } from "../utils/plural";
import { useLanguage } from "../context/LanguageContext";
import "./DatePickerPanel.css";

const FLEX_IDS = ["exact", "1", "2", "3", "7", "14"];
const FLEX_DURATIONS = ["weekend", "week", "month"];
const MONTH_DURATIONS = ["week", "month"];
const DURATION_KEYS = { weekend: "durationWeekend", week: "durationWeek", month: "durationMonth" };
const sameMonth = (a, b) => a.year === b.year && a.month === b.month;

// Props optionnelles (rétrocompatibles) :
// - isDateDisabled(date, { selecting, checkIn }) : true pour rendre un jour non sélectionnable
//   (ex. nuits déjà réservées) ; `selecting` vaut "in" ou "out" selon l'étape en cours.
// - datesOnly : masque les onglets de mode et la flexibilité (sélection de dates seule).
const DatePickerPanel = ({
  checkIn,
  checkOut,
  flexibility,
  onCheckInChange,
  onCheckOutChange,
  onFlexibilityChange,
  isDateDisabled,
  datesOnly = false,
}) => {
  const { t, language } = useLanguage();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthNames = getMonthNames(language);
  const weekStart = getWeekStart(language);
  const dayLabels = getWeekdayLabels(language, weekStart);

  // Le panneau est monté à l'ouverture : mois affiché et étape initialisés une seule fois.
  const [leftMonth, setLeftMonth] = useState(() => {
    const d = checkIn || new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const rightDate = new Date(leftMonth.year, leftMonth.month + 1, 1);
  const rightMonth = { year: rightDate.getFullYear(), month: rightDate.getMonth() };
  const [mode, setMode] = useState("dates");
  const [selecting, setSelecting] = useState(() => (checkIn && !checkOut ? "out" : "in"));
  // Modes « Mois » et « Flexibles » : la plage est appliquée dès que le choix est complet.
  const [monthChoice, setMonthChoice] = useState(null);
  const [monthDuration, setMonthDuration] = useState("week");
  const [flexMonths, setFlexMonths] = useState([]);
  const [flexDuration, setFlexDuration] = useState("weekend");
  const monthOptions = upcomingMonths(12, today);
  const isBlocked = (date) => (isDateDisabled ? Boolean(isDateDisabled(date, { selecting, checkIn })) : false);

  const flexLabel = (id) =>
    id === "exact" ? t("datePicker.flexExact") : pluralize(t, language, "datePicker.flexDays", Number(id));

  const handleDateClick = (year, month, day) => {
    if (!day) return;
    const date = new Date(year, month, day);
    if (date < today) return;
    if (isBlocked(date)) return;
    if (selecting === "in") {
      onCheckInChange(date);
      // Le départ doit rester strictement après l'arrivée (au moins 1 nuit).
      if (checkOut && !isBefore(date, checkOut)) onCheckOutChange(null);
      setSelecting("out");
      return;
    }
    if (checkIn && isSameDay(date, checkIn)) return; // séjour de 0 nuit refusé
    if (checkIn && isBefore(date, checkIn)) {
      onCheckInChange(date);
      onCheckOutChange(null);
      setSelecting("out");
      return;
    }
    onCheckOutChange(date);
  };

  const shiftMonth = (delta) => {
    const d = new Date(leftMonth.year, leftMonth.month + delta, 1);
    setLeftMonth({ year: d.getFullYear(), month: d.getMonth() });
  };
  const goPrev = () => shiftMonth(-1);
  const goNext = () => shiftMonth(1);

  // Applique une plage calculée (modes Mois / Flexibles) : seules checkIn/checkOut remontent.
  const applyRange = (range) => {
    if (!range) return;
    onCheckInChange(range.checkIn);
    onCheckOutChange(range.checkOut);
    setLeftMonth({ year: range.checkIn.getFullYear(), month: range.checkIn.getMonth() });
    setSelecting("in");
  };
  const chooseMonth = (ref) => {
    setMonthChoice(ref);
    applyRange(rangeForMonth(ref, monthDuration, today));
  };
  const chooseMonthDuration = (duration) => {
    setMonthDuration(duration);
    if (monthChoice) applyRange(rangeForMonth(monthChoice, duration, today));
  };
  const toggleFlexMonth = (ref) => {
    const next = flexMonths.some((m) => sameMonth(m, ref))
      ? flexMonths.filter((m) => !sameMonth(m, ref))
      : [...flexMonths, ref];
    setFlexMonths(next);
    applyRange(rangeForFlexible(next, flexDuration, today));
  };
  const chooseFlexDuration = (duration) => {
    setFlexDuration(duration);
    applyRange(rangeForFlexible(flexMonths, duration, today));
  };

  const rangeText =
    checkIn && checkOut
      ? interpolate(t("datePicker.rangeSummary"), {
          start: formatDateShort(checkIn, language),
          end: formatDateShort(checkOut, language),
        })
      : "";

  const grid1 = getMonthGrid(leftMonth.year, leftMonth.month, weekStart);
  const grid2 = getMonthGrid(rightMonth.year, rightMonth.month, weekStart);

  const renderChip = (key, label, active, onClick) => (
    <button
      key={key}
      type="button"
      className={`date-picker-flex-btn ${active ? "date-picker-flex-btn--active" : ""}`}
      onClick={onClick}
      aria-pressed={Boolean(active)}
    >
      {label}
    </button>
  );

  const renderMonthChips = (isActive, onPick) =>
    monthOptions.map((ref) =>
      renderChip(`${ref.year}-${ref.month}`, `${monthNames[ref.month]} ${ref.year}`, isActive(ref), () => onPick(ref))
    );

  return (
    <div className={`date-picker-panel${datesOnly ? " date-picker-panel--dates-only" : ""}`} role="dialog" aria-label={t("datePicker.dialog")}>
      {!datesOnly && (
      <div className="date-picker-modes">
        <button
          type="button"
          className={`date-picker-mode ${mode === "dates" ? "date-picker-mode--active" : ""}`}
          onClick={() => setMode("dates")}
          aria-pressed={mode === "dates"}
        >
          {t("datePicker.tabDates")}
        </button>
        <button
          type="button"
          className={`date-picker-mode ${mode === "mois" ? "date-picker-mode--active" : ""}`}
          onClick={() => setMode("mois")}
          aria-pressed={mode === "mois"}
        >
          {t("datePicker.tabMonths")}
        </button>
        <button
          type="button"
          className={`date-picker-mode ${mode === "flexibles" ? "date-picker-mode--active" : ""}`}
          onClick={() => setMode("flexibles")}
          aria-pressed={mode === "flexibles"}
        >
          {t("datePicker.tabFlexible")}
        </button>
      </div>
      )}

      {mode === "dates" && (
        <>
          <div className="date-picker-calendars">
            <div className="date-picker-calendar">
              <div className="date-picker-calendar-header">
                <button type="button" className="date-picker-nav" onClick={goPrev} aria-label={t("datePicker.prevMonth")}>
                  ‹
                </button>
                <span>{monthNames[leftMonth.month]} {leftMonth.year}</span>
              </div>
              <div className="date-picker-days">
                {dayLabels.map((d, i) => (
                  <span key={i} className="date-picker-day-label">{d}</span>
                ))}
                {grid1.flat().map((day, i) => {
                  if (day == null) return <span key={`e1-${i}`} className="date-picker-cell date-picker-cell--empty" />;
                  const date = new Date(leftMonth.year, leftMonth.month, day);
                  const inRange = isInRange(date, checkIn, checkOut);
                  const isStart = checkIn && isSameDay(date, checkIn);
                  const isEnd = checkOut && isSameDay(date, checkOut);
                  const isPast = date < today;
                  const isBooked = !isPast && isBlocked(date);
                  return (
                    <button
                      key={`1-${day}`}
                      type="button"
                      className={`date-picker-cell ${inRange ? "date-picker-cell--range" : ""} ${isStart ? "date-picker-cell--start" : ""} ${isEnd ? "date-picker-cell--end" : ""} ${isPast || isBooked ? "date-picker-cell--disabled" : ""} ${isBooked ? "date-picker-cell--booked" : ""}`}
                      onClick={() => handleDateClick(leftMonth.year, leftMonth.month, day)}
                      disabled={isPast || isBooked}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="date-picker-calendar">
              <div className="date-picker-calendar-header">
                <span>{monthNames[rightMonth.month]} {rightMonth.year}</span>
                <button type="button" className="date-picker-nav" onClick={goNext} aria-label={t("datePicker.nextMonth")}>
                  ›
                </button>
              </div>
              <div className="date-picker-days">
                {dayLabels.map((d, i) => (
                  <span key={i} className="date-picker-day-label">{d}</span>
                ))}
                {grid2.flat().map((day, i) => {
                  if (day == null) return <span key={`e2-${i}`} className="date-picker-cell date-picker-cell--empty" />;
                  const date = new Date(rightMonth.year, rightMonth.month, day);
                  const inRange = isInRange(date, checkIn, checkOut);
                  const isStart = checkIn && isSameDay(date, checkIn);
                  const isEnd = checkOut && isSameDay(date, checkOut);
                  const isPast = date < today;
                  const isBooked = !isPast && isBlocked(date);
                  return (
                    <button
                      key={`2-${day}`}
                      type="button"
                      className={`date-picker-cell ${inRange ? "date-picker-cell--range" : ""} ${isStart ? "date-picker-cell--start" : ""} ${isEnd ? "date-picker-cell--end" : ""} ${isPast || isBooked ? "date-picker-cell--disabled" : ""} ${isBooked ? "date-picker-cell--booked" : ""}`}
                      onClick={() => handleDateClick(rightMonth.year, rightMonth.month, day)}
                      disabled={isPast || isBooked}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {!datesOnly && (
          <div className="date-picker-flex">
            {FLEX_IDS.map((id) => renderChip(id, flexLabel(id), flexibility === id, () => onFlexibilityChange(id)))}
          </div>
          )}
        </>
      )}

      {mode === "mois" && (
        <div className="date-picker-mode-panel">
          <p className="date-picker-step">{t("datePicker.monthStep")}</p>
          <div className="date-picker-flex" role="group" aria-label={t("datePicker.monthStep")}>
            {renderMonthChips((ref) => monthChoice && sameMonth(monthChoice, ref), chooseMonth)}
          </div>
          <p className="date-picker-step">{t("datePicker.durationStep")}</p>
          <div className="date-picker-flex" role="group" aria-label={t("datePicker.durationStep")}>
            {MONTH_DURATIONS.map((d) =>
              renderChip(d, t(`datePicker.${DURATION_KEYS[d]}`), monthDuration === d, () => chooseMonthDuration(d))
            )}
          </div>
          <p className="date-picker-summary" aria-live="polite">{rangeText}</p>
        </div>
      )}
      {mode === "flexibles" && (
        <div className="date-picker-mode-panel">
          <p className="date-picker-step">{t("datePicker.durationStep")}</p>
          <div className="date-picker-flex" role="group" aria-label={t("datePicker.durationStep")}>
            {FLEX_DURATIONS.map((d) =>
              renderChip(d, t(`datePicker.${DURATION_KEYS[d]}`), flexDuration === d, () => chooseFlexDuration(d))
            )}
          </div>
          <p className="date-picker-step">{t("datePicker.flexMonthsStep")}</p>
          <div className="date-picker-flex" role="group" aria-label={t("datePicker.flexMonthsStep")}>
            {renderMonthChips((ref) => flexMonths.some((m) => sameMonth(m, ref)), toggleFlexMonth)}
          </div>
          <p className="date-picker-summary" aria-live="polite">{rangeText}</p>
        </div>
      )}
    </div>
  );
};

export default DatePickerPanel;
