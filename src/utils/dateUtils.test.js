import {
  getMonthGrid,
  formatDateShort,
  isSameDay,
  isBefore,
  isInRange,
  FR_MONTHS,
  FR_DAYS,
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
  test("formats as 'day abbreviated-French-month'", () => {
    expect(formatDateShort(new Date(2024, 0, 5))).toBe("5 Jan");
    expect(formatDateShort(new Date(2024, 7, 15))).toBe("15 Aoû");
    expect(formatDateShort(new Date(2024, 11, 31))).toBe("31 Déc");
  });

  test("returns empty string for null/undefined", () => {
    expect(formatDateShort(null)).toBe("");
    expect(formatDateShort(undefined)).toBe("");
  });

  test("uses the normalised date after month overflow (31 Jan 2023 set to February => 3 Mar)", () => {
    const d = new Date(2023, 0, 31);
    d.setMonth(1);
    expect(formatDateShort(d)).toBe("3 Mar");
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
  });

  test("FR_DAYS has 7 entries", () => {
    expect(FR_DAYS).toHaveLength(7);
  });
});
