import {
  getMonthGrid,
  formatDateShort,
  isSameDay,
  isBefore,
  isInRange,
  FR_MONTHS,
  FR_DAYS,
  getMonthNames,
  getWeekStart,
  getWeekdayLabels,
  addMonths,
  monthStart,
  rangeForMonth,
  rangeForFlexible,
  upcomingMonths,
} from "./dateUtils";

describe("getMonthGrid", () => {
  const flat = (g) => g.flat().filter((d) => d !== null);

  test("contains every day of the month exactly once, in order (31-day month)", () => {
    expect(flat(getMonthGrid(2024, 0))).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });

  test("February 2024 (leap year) has 29 days", () => {
    expect(flat(getMonthGrid(2024, 1))).toHaveLength(29);
  });

  test("February 2023 (non-leap year) has 28 days", () => {
    expect(flat(getMonthGrid(2023, 1))).toHaveLength(28);
  });

  test("century year 1900 is not a leap year", () => {
    expect(flat(getMonthGrid(1900, 1))).toHaveLength(28);
  });

  test("century year 2000 is a leap year", () => {
    expect(flat(getMonthGrid(2000, 1))).toHaveLength(29);
  });

  test("every week has 7 cells", () => {
    getMonthGrid(2024, 4).forEach((w) => expect(w).toHaveLength(7));
  });

  test("first day is placed in the column of its weekday (Sunday-first)", () => {
    // 1er septembre 2024 = dimanche
    expect(getMonthGrid(2024, 8)[0][0]).toBe(1);
    // 1er mai 2024 = mercredi
    const g = getMonthGrid(2024, 4);
    expect(g[0].slice(0, 3)).toEqual([null, null, null]);
    expect(g[0][3]).toBe(1);
  });

  test("February 2015 starting on Sunday with 28 days yields exactly 4 weeks", () => {
    expect(getMonthGrid(2015, 1)).toHaveLength(4);
  });

  test("a 31-day month starting on Friday needs 6 weeks", () => {
    // 1er mars 2024 = vendredi
    expect(getMonthGrid(2024, 2)).toHaveLength(6);
  });

  test("month overflow (12 => January next year) is normalised", () => {
    expect(getMonthGrid(2024, 12)).toEqual(getMonthGrid(2025, 0));
  });

  test("negative month (-1 => December previous year) is normalised", () => {
    expect(getMonthGrid(2024, -1)).toEqual(getMonthGrid(2023, 11));
  });

  test("does not crash on NaN inputs", () => {
    expect(Array.isArray(getMonthGrid(NaN, NaN))).toBe(true);
  });
});

describe("formatDateShort", () => {
  test("formats as day + abbreviated month, in French by default", () => {
    expect(formatDateShort(new Date(2024, 0, 5))).toBe("5 janv.");
    expect(formatDateShort(new Date(2024, 7, 15))).toBe("15 août");
    expect(formatDateShort(new Date(2024, 11, 31))).toBe("31 déc.");
  });

  test("follows the requested locale (English puts the month first)", () => {
    expect(formatDateShort(new Date(2024, 0, 5), "en")).toBe("Jan 5");
    expect(formatDateShort(new Date(2024, 0, 5), "de")).toBe("5. Jan.");
  });

  test("returns empty string for null/undefined", () => {
    expect(formatDateShort(null)).toBe("");
    expect(formatDateShort(undefined)).toBe("");
  });

  test("uses the normalised date after month overflow (31 Jan 2023 set to February => 3 Mar)", () => {
    const d = new Date(2023, 0, 31);
    d.setMonth(1);
    expect(formatDateShort(d)).toBe("3 mars");
  });

  test("returns empty string for an Invalid Date instead of throwing", () => {
    // Attendu : "". Actuellement FR_MONTHS[NaN] est undefined -> TypeError.
    expect(formatDateShort(new Date("invalid"))).toBe("");
  });
});

describe("isSameDay", () => {
  test("true for two times on the same calendar day", () => {
    expect(isSameDay(new Date(2024, 5, 1, 0, 0, 0), new Date(2024, 5, 1, 23, 59, 59))).toBe(true);
  });

  test("false across midnight", () => {
    expect(isSameDay(new Date(2024, 5, 1, 23, 59, 59), new Date(2024, 5, 2, 0, 0, 0))).toBe(false);
  });

  test("false for same day/month but different year", () => {
    expect(isSameDay(new Date(2023, 5, 1), new Date(2024, 5, 1))).toBe(false);
  });

  test("false for same day-of-month but different month", () => {
    expect(isSameDay(new Date(2024, 4, 1), new Date(2024, 5, 1))).toBe(false);
  });

  test("false when either argument is missing", () => {
    expect(isSameDay(null, new Date())).toBe(false);
    expect(isSameDay(new Date(), undefined)).toBe(false);
  });

  test("false when comparing Invalid Dates", () => {
    expect(isSameDay(new Date("x"), new Date("x"))).toBe(false);
  });

  test("Dec 31 and Jan 1 are different days", () => {
    expect(isSameDay(new Date(2023, 11, 31), new Date(2024, 0, 1))).toBe(false);
  });
});

describe("isBefore", () => {
  test("true when a is earlier", () => {
    expect(isBefore(new Date(2024, 0, 1), new Date(2024, 0, 2))).toBe(true);
  });

  test("false when equal", () => {
    expect(isBefore(new Date(2024, 0, 1), new Date(2024, 0, 1))).toBe(false);
  });

  test("false when a is later", () => {
    expect(isBefore(new Date(2025, 0, 1), new Date(2024, 0, 1))).toBe(false);
  });

  test("false when an argument is missing", () => {
    expect(isBefore(null, new Date())).toBe(false);
    expect(isBefore(new Date(), null)).toBe(false);
  });

  test("false with Invalid Date", () => {
    expect(isBefore(new Date("x"), new Date())).toBe(false);
  });
});

describe("isInRange", () => {
  const start = new Date(2024, 0, 10);
  const end = new Date(2024, 0, 20);

  test("true for a date strictly inside", () => {
    expect(isInRange(new Date(2024, 0, 15), start, end)).toBe(true);
  });

  test("true on both bounds (inclusive)", () => {
    expect(isInRange(start, start, end)).toBe(true);
    expect(isInRange(end, start, end)).toBe(true);
  });

  test("false outside the range", () => {
    expect(isInRange(new Date(2024, 0, 9), start, end)).toBe(false);
    expect(isInRange(new Date(2024, 0, 21), start, end)).toBe(false);
  });

  test("works across a year boundary", () => {
    expect(isInRange(new Date(2024, 0, 1), new Date(2023, 11, 28), new Date(2024, 0, 3))).toBe(true);
  });

  test("without end, only the start day matches", () => {
    expect(isInRange(new Date(2024, 0, 10, 15), start, null)).toBe(true);
    expect(isInRange(new Date(2024, 0, 11), start, null)).toBe(false);
  });

  test("false when date or start is missing", () => {
    expect(isInRange(null, start, end)).toBe(false);
    expect(isInRange(new Date(), null, end)).toBe(false);
  });

  test("false when the range is inverted (end before start)", () => {
    expect(isInRange(new Date(2024, 0, 15), end, start)).toBe(false);
  });

  test("a date on the DST-change day (31 March 2024) is in range", () => {
    expect(isInRange(new Date(2024, 2, 31, 12), new Date(2024, 2, 30), new Date(2024, 3, 1))).toBe(true);
  });

  test("a time later in the day on the end date is still considered in range", () => {
    // Attendu : la journee de fin est incluse. Echoue si les dates ne sont pas normalisees a minuit.
    expect(isInRange(new Date(2024, 0, 20, 15), start, end)).toBe(true);
  });
});

describe("constants", () => {
  test("FR_MONTHS has 12 entries starting with Janvier", () => {
    expect(FR_MONTHS).toHaveLength(12);
    expect(FR_MONTHS[0]).toBe("Janvier");
    expect(FR_MONTHS[7]).toBe("Août");
  });

  test("FR_DAYS has 7 entries, Sunday first", () => {
    expect(FR_DAYS).toHaveLength(7);
    expect(FR_DAYS).toEqual(["D", "L", "M", "M", "J", "V", "S"]);
  });
});

describe("locale helpers", () => {
  test("getMonthNames gives 12 capitalised names per language", () => {
    expect(getMonthNames("en")[0]).toBe("January");
    expect(getMonthNames("es")[11]).toBe("Diciembre");
    expect(getMonthNames("de")[2]).toBe("März");
    expect(getMonthNames("pt")[2]).toBe("Março");
    ["fr", "en", "es", "de", "pt"].forEach((l) => expect(new Set(getMonthNames(l)).size).toBe(12));
  });

  test("week starts on Sunday for English, Monday otherwise", () => {
    expect(getWeekStart("en")).toBe(0);
    ["fr", "es", "de", "pt"].forEach((l) => expect(getWeekStart(l)).toBe(1));
  });

  test("getWeekdayLabels starts at the requested weekday", () => {
    expect(getWeekdayLabels("en", 0)).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
    expect(getWeekdayLabels("fr")).toEqual(["L", "M", "M", "J", "V", "S", "D"]);
  });

  test("getMonthGrid honours weekStart (Monday-first)", () => {
    // 1er septembre 2024 = dimanche : dernière colonne si la semaine commence le lundi.
    const g = getMonthGrid(2024, 8, 1);
    expect(g[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(g[0][6]).toBe(1);
    // 1er mai 2024 = mercredi : colonne 2 en semaine lundi-first.
    expect(getMonthGrid(2024, 4, 1)[0][2]).toBe(1);
  });
});

describe("month / flexible ranges", () => {
  const today = new Date(2026, 4, 20); // mercredi 20 mai 2026

  test("addMonths clamps to the end of a shorter month", () => {
    expect(addMonths(new Date(2024, 0, 31), 1)).toEqual(new Date(2024, 1, 29));
  });

  test("monthStart is the 1st, or today for the current month", () => {
    expect(monthStart({ year: 2026, month: 6 }, today)).toEqual(new Date(2026, 6, 1));
    expect(monthStart({ year: 2026, month: 4 }, today)).toEqual(today);
  });

  test("rangeForMonth: 1st of the month + 1 week / 1 month", () => {
    expect(rangeForMonth({ year: 2026, month: 6 }, "week", today)).toEqual({
      checkIn: new Date(2026, 6, 1),
      checkOut: new Date(2026, 6, 8),
    });
    expect(rangeForMonth({ year: 2026, month: 6 }, "month", today)).toEqual({
      checkIn: new Date(2026, 6, 1),
      checkOut: new Date(2026, 7, 1),
    });
  });

  test("rangeForMonth never starts in the past", () => {
    expect(rangeForMonth({ year: 2026, month: 4 }, "week", today).checkIn).toEqual(today);
  });

  test("rangeForFlexible uses the earliest chosen month; weekend starts on a Friday for 2 nights", () => {
    const r = rangeForFlexible([{ year: 2026, month: 8 }, { year: 2026, month: 6 }], "weekend", today);
    // 1er juillet 2026 = mercredi -> vendredi 3 juillet
    expect(r.checkIn).toEqual(new Date(2026, 6, 3));
    expect(r.checkIn.getDay()).toBe(5);
    expect(r.checkOut).toEqual(new Date(2026, 6, 5));
  });

  test("rangeForFlexible: week and month durations; null without any month", () => {
    const m = [{ year: 2026, month: 6 }];
    expect(rangeForFlexible(m, "week", today).checkOut).toEqual(new Date(2026, 6, 8));
    expect(rangeForFlexible(m, "month", today).checkOut).toEqual(new Date(2026, 7, 1));
    expect(rangeForFlexible([], "week", today)).toBeNull();
  });

  test("upcomingMonths lists consecutive months across the year boundary", () => {
    expect(upcomingMonths(3, new Date(2026, 10, 15))).toEqual([
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
      { year: 2027, month: 0 },
    ]);
  });
});
