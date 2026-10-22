import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import DatePickerPanel from "./DatePickerPanel";
import { LanguageProvider } from "../context/LanguageContext";
import { FR_MONTHS, getMonthNames } from "../utils/dateUtils";

const nextYear = new Date().getFullYear() + 1;
const checkIn = new Date(nextYear, 5, 10); // 10 juin de l'année prochaine

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
});

const renderPanel = (props = {}) => {
  const handlers = {
    onCheckInChange: vi.fn(),
    onCheckOutChange: vi.fn(),
    onFlexibilityChange: vi.fn(),
  };
  render(
    <LanguageProvider>
      <DatePickerPanel flexibility="exact" {...handlers} {...props} />
    </LanguageProvider>
  );
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

  test("French: tabs, flexibility options and singular/plural day labels", () => {
    renderPanel({ checkIn, checkOut: null });
    ["Dates", "Mois", "Flexibles", "Dates exactes", "± 1 journée", "± 2 journées", "± 14 journées"].forEach((name) =>
      expect(screen.getByRole("button", { name })).toBeInTheDocument()
    );
  });
});

describe("DatePickerPanel in English", () => {
  beforeEach(() => localStorage.setItem("afrikabnb_lang", "en"));

  test("translates month names, navigation, tabs and flexibility options", () => {
    renderPanel({ checkIn, checkOut: null });
    expect(screen.getByText(`${getMonthNames("en")[5]} ${nextYear}`)).toBeInTheDocument();
    expect(screen.getByLabelText("Next month")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Choose dates" })).toBeInTheDocument();
    ["Dates", "Months", "Flexible", "Exact dates", "± 1 day", "± 7 days"].forEach((name) =>
      expect(screen.getByRole("button", { name })).toBeInTheDocument()
    );
  });

  test("weeks start on Sunday in English (June 2027 starts on a Tuesday = 3rd column)", () => {
    renderPanel({ checkIn: new Date(2027, 5, 10), checkOut: null });
    const labels = screen.getAllByText(/^[SMTWF]$/).slice(0, 7).map((n) => n.textContent);
    expect(labels).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
    const cells = document.querySelectorAll(".date-picker-days")[0].querySelectorAll(".date-picker-cell");
    expect(cells[0]).toHaveClass("date-picker-cell--empty");
    expect(cells[1]).toHaveClass("date-picker-cell--empty");
    expect(cells[2]).toHaveTextContent("1");
  });
});

describe("DatePickerPanel in French: Monday-first weeks", () => {
  test("June 2027 starts on a Tuesday = 2nd column", () => {
    renderPanel({ checkIn: new Date(2027, 5, 10), checkOut: null });
    const cells = document.querySelectorAll(".date-picker-days")[0].querySelectorAll(".date-picker-cell");
    expect(cells[0]).toHaveClass("date-picker-cell--empty");
    expect(cells[1]).toHaveTextContent("1");
  });
});

describe("DatePickerPanel « Mois » mode", () => {
  const openMonths = (props) => {
    const handlers = renderPanel(props);
    fireEvent.click(screen.getByRole("button", { name: "Mois" }));
    return handlers;
  };

  test("no longer shows a « à venir » placeholder and offers months and durations", () => {
    openMonths();
    expect(screen.queryByText(/à venir/)).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Choisissez un mois" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Une semaine" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Un mois" })).toBeInTheDocument();
  });

  test("choosing a month sets check-in on the 1st and check-out one week later", () => {
    const { onCheckInChange, onCheckOutChange } = openMonths();
    const target = new Date();
    target.setMonth(target.getMonth() + 2, 1); // 1er du mois, dans 2 mois
    const label = `${FR_MONTHS[target.getMonth()]} ${target.getFullYear()}`;
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onCheckInChange).toHaveBeenLastCalledWith(new Date(target.getFullYear(), target.getMonth(), 1));
    expect(onCheckOutChange).toHaveBeenLastCalledWith(new Date(target.getFullYear(), target.getMonth(), 8));
  });

  test("switching the duration to one month re-applies the range to the first of the next month", () => {
    const { onCheckInChange, onCheckOutChange } = openMonths();
    const target = new Date();
    target.setMonth(target.getMonth() + 2, 1);
    fireEvent.click(screen.getByRole("button", { name: `${FR_MONTHS[target.getMonth()]} ${target.getFullYear()}` }));
    fireEvent.click(screen.getByRole("button", { name: "Un mois" }));
    expect(onCheckInChange).toHaveBeenLastCalledWith(new Date(target.getFullYear(), target.getMonth(), 1));
    expect(onCheckOutChange).toHaveBeenLastCalledWith(new Date(target.getFullYear(), target.getMonth() + 1, 1));
  });

  test("changing the duration alone does nothing before a month is chosen", () => {
    const { onCheckInChange } = openMonths();
    fireEvent.click(screen.getByRole("button", { name: "Un mois" }));
    expect(onCheckInChange).not.toHaveBeenCalled();
  });

  test("the current month starts today, never in the past", () => {
    const { onCheckInChange } = openMonths();
    const now = new Date();
    fireEvent.click(screen.getByRole("button", { name: `${FR_MONTHS[now.getMonth()]} ${now.getFullYear()}` }));
    expect(onCheckInChange).toHaveBeenLastCalledWith(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  });

  test("is keyboard accessible: options are native buttons exposing their pressed state", () => {
    openMonths();
    const now = new Date();
    const btn = screen.getByRole("button", { name: `${FR_MONTHS[now.getMonth()]} ${now.getFullYear()}` });
    expect(btn.tagName).toBe("BUTTON");
    expect(btn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  test("English labels", () => {
    localStorage.setItem("afrikabnb_lang", "en");
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Months" }));
    expect(screen.getByRole("group", { name: "Choose a month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A week" })).toBeInTheDocument();
  });
});

describe("DatePickerPanel « Flexibles » mode", () => {
  const openFlexible = (props) => {
    const handlers = renderPanel(props);
    fireEvent.click(screen.getByRole("button", { name: "Flexibles" }));
    return handlers;
  };

  test("offers weekend / week / month durations, weekend selected by default", () => {
    openFlexible();
    expect(screen.queryByText(/à venir/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Un week-end" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Une semaine" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Un mois" })).toBeInTheDocument();
  });

  test("a week starts at the beginning of the first month chosen, whatever the click order", () => {
    const { onCheckInChange, onCheckOutChange } = openFlexible();
    fireEvent.click(screen.getByRole("button", { name: "Une semaine" }));
    const a = new Date();
    a.setMonth(a.getMonth() + 3, 1);
    const b = new Date();
    b.setMonth(b.getMonth() + 5, 1);
    const name = (d) => `${FR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    fireEvent.click(screen.getByRole("button", { name: name(b) }));
    fireEvent.click(screen.getByRole("button", { name: name(a) }));
    expect(onCheckInChange).toHaveBeenLastCalledWith(new Date(a.getFullYear(), a.getMonth(), 1));
    expect(onCheckOutChange).toHaveBeenLastCalledWith(new Date(a.getFullYear(), a.getMonth(), 8));
  });

  test("a weekend starts on a Friday and lasts 2 nights", () => {
    const { onCheckInChange, onCheckOutChange } = openFlexible();
    const a = new Date();
    a.setMonth(a.getMonth() + 3, 1);
    fireEvent.click(screen.getByRole("button", { name: `${FR_MONTHS[a.getMonth()]} ${a.getFullYear()}` }));
    const start = onCheckInChange.mock.calls.at(-1)[0];
    const end = onCheckOutChange.mock.calls.at(-1)[0];
    expect(start.getDay()).toBe(5);
    expect(start.getMonth()).toBe(a.getMonth());
    expect(Math.round((end - start) / 86400000)).toBe(2);
  });

  test("months are multi-select toggles; deselecting the last one stops emitting", () => {
    const { onCheckInChange } = openFlexible();
    const a = new Date();
    a.setMonth(a.getMonth() + 1, 1);
    const btn = screen.getByRole("button", { name: `${FR_MONTHS[a.getMonth()]} ${a.getFullYear()}` });
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(onCheckInChange).toHaveBeenCalledTimes(1);
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(onCheckInChange).toHaveBeenCalledTimes(1);
  });
});
