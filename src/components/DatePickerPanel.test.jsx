import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import DatePickerPanel from "./DatePickerPanel";
import { FR_MONTHS } from "../utils/dateUtils";

const nextYear = new Date().getFullYear() + 1;
const checkIn = new Date(nextYear, 5, 10); // 10 juin de l'année prochaine

const renderPanel = (props = {}) => {
  const handlers = {
    onCheckInChange: vi.fn(),
    onCheckOutChange: vi.fn(),
    onFlexibilityChange: vi.fn(),
  };
  render(<DatePickerPanel flexibility="exact" {...handlers} {...props} />);
  return handlers;
};

const dayButton = (calendarIndex, day) =>
  screen
    .getAllByRole("button", { name: String(day) })
    .filter((b) => b.classList.contains("date-picker-cell"))[calendarIndex];

describe("DatePickerPanel", () => {
  test("right month is always the month after the left one, including after navigation", () => {
    renderPanel({ checkIn, checkOut: null });
    expect(screen.getByText(`${FR_MONTHS[5]} ${nextYear}`)).toBeInTheDocument();
    expect(screen.getByText(`${FR_MONTHS[6]} ${nextYear}`)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Mois suivant"));
    expect(screen.getByText(`${FR_MONTHS[6]} ${nextYear}`)).toBeInTheDocument();
    expect(screen.getByText(`${FR_MONTHS[7]} ${nextYear}`)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Mois précédent"));
    fireEvent.click(screen.getByLabelText("Mois précédent"));
    expect(screen.getByText(`${FR_MONTHS[4]} ${nextYear}`)).toBeInTheDocument();
    expect(screen.getByText(`${FR_MONTHS[5]} ${nextYear}`)).toBeInTheDocument();
  });

  test("refuses a check-out on the same day as the check-in (stay of at least 1 night)", () => {
    const { onCheckOutChange, onCheckInChange } = renderPanel({ checkIn, checkOut: null });
    fireEvent.click(dayButton(0, 10));
    expect(onCheckOutChange).not.toHaveBeenCalled();
    expect(onCheckInChange).not.toHaveBeenCalled();
  });

  test("accepts a check-out after the check-in", () => {
    const { onCheckOutChange } = renderPanel({ checkIn, checkOut: null });
    fireEvent.click(dayButton(0, 11));
    expect(onCheckOutChange).toHaveBeenCalledWith(new Date(nextYear, 5, 11));
  });

  test("a date before the check-in restarts the selection from that date", () => {
    const { onCheckInChange, onCheckOutChange } = renderPanel({ checkIn, checkOut: null });
    fireEvent.click(dayButton(0, 5));
    expect(onCheckInChange).toHaveBeenCalledWith(new Date(nextYear, 5, 5));
    expect(onCheckOutChange).toHaveBeenCalledWith(null);
  });

  test("isDateDisabled blocks a day (disabled button, click ignored) and receives the current step", () => {
    const isDateDisabled = vi.fn((date) => date.getDate() === 15 && date.getMonth() === 5);
    const { onCheckOutChange } = renderPanel({ checkIn, checkOut: null, isDateDisabled });
    const blocked = dayButton(0, 15);
    expect(blocked).toBeDisabled();
    expect(blocked).toHaveClass("date-picker-cell--booked");
    fireEvent.click(blocked);
    expect(onCheckOutChange).not.toHaveBeenCalled();
    expect(isDateDisabled).toHaveBeenCalledWith(expect.any(Date), { selecting: "out", checkIn });
    expect(dayButton(0, 14)).not.toBeDisabled();
  });

  test("datesOnly hides the mode tabs and the flexibility options", () => {
    renderPanel({ checkIn, checkOut: null, datesOnly: true });
    expect(screen.queryByRole("button", { name: "Mois" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dates exactes" })).not.toBeInTheDocument();
  });
});
