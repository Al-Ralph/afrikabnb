import React, { useState } from "react";
import { getMonthGrid, FR_MONTHS, FR_DAYS, isSameDay, isBefore, isInRange } from "../utils/dateUtils";
import "./DatePickerPanel.css";

const FLEX_OPTIONS = [
  { id: "exact", label: "Dates exactes" },
  { id: "1", label: "± 1 journée" },
  { id: "2", label: "± 2 journées" },
  { id: "3", label: "± 3 journées" },
  { id: "7", label: "± 7 journées" },
  { id: "14", label: "± 14 journées" },
];

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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Le panneau est monté à l'ouverture : mois affiché et étape initialisés une seule fois.
  const [leftMonth, setLeftMonth] = useState(() => {
    const d = checkIn || new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const rightDate = new Date(leftMonth.year, leftMonth.month + 1, 1);
  const rightMonth = { year: rightDate.getFullYear(), month: rightDate.getMonth() };
  const [mode, setMode] = useState("dates");
  const [selecting, setSelecting] = useState(() => (checkIn && !checkOut ? "out" : "in"));
  const isBlocked = (date) => (isDateDisabled ? Boolean(isDateDisabled(date, { selecting, checkIn })) : false);

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

  const grid1 = getMonthGrid(leftMonth.year, leftMonth.month);
  const grid2 = getMonthGrid(rightMonth.year, rightMonth.month);

  return (
    <div className={`date-picker-panel${datesOnly ? " date-picker-panel--dates-only" : ""}`} role="dialog" aria-label="Choisir les dates">
      {!datesOnly && (
      <div className="date-picker-modes">
        <button
          type="button"
          className={`date-picker-mode ${mode === "dates" ? "date-picker-mode--active" : ""}`}
          onClick={() => setMode("dates")}
        >
          Dates
        </button>
        <button
          type="button"
          className={`date-picker-mode ${mode === "mois" ? "date-picker-mode--active" : ""}`}
          onClick={() => setMode("mois")}
        >
          Mois
        </button>
        <button
          type="button"
          className={`date-picker-mode ${mode === "flexibles" ? "date-picker-mode--active" : ""}`}
          onClick={() => setMode("flexibles")}
        >
          Flexibles
        </button>
      </div>
      )}

      {mode === "dates" && (
        <>
          <div className="date-picker-calendars">
            <div className="date-picker-calendar">
              <div className="date-picker-calendar-header">
                <button type="button" className="date-picker-nav" onClick={goPrev} aria-label="Mois précédent">
                  ‹
                </button>
                <span>{FR_MONTHS[leftMonth.month]} {leftMonth.year}</span>
              </div>
              <div className="date-picker-days">
                {FR_DAYS.map((d, i) => (
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
                <span>{FR_MONTHS[rightMonth.month]} {rightMonth.year}</span>
                <button type="button" className="date-picker-nav" onClick={goNext} aria-label="Mois suivant">
                  ›
                </button>
              </div>
              <div className="date-picker-days">
                {FR_DAYS.map((d, i) => (
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
            {FLEX_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`date-picker-flex-btn ${flexibility === opt.id ? "date-picker-flex-btn--active" : ""}`}
                onClick={() => onFlexibilityChange(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          )}
        </>
      )}

      {mode === "mois" && (
        <div className="date-picker-placeholder">
          Sélection par mois – à venir
        </div>
      )}
      {mode === "flexibles" && (
        <div className="date-picker-placeholder">
          Recherche flexible – à venir
        </div>
      )}
    </div>
  );
};

export default DatePickerPanel;
