import { describe, expect, test } from "bun:test";
import {
  CalendarDate,
  CalendarDateTime,
  Time,
  endOfMonth,
  endOfWeek,
  getDayOfWeek,
  getDaysInMonth,
  getFirstDayOfWeek,
  getISOWeek,
  getMinimalDaysInFirstWeek,
  getWeekOfYear,
  getWeeksInMonth,
  isLeapYear,
  isSameDay,
  isSameMonth,
  parseDate,
  parseDateTime,
  parseTime,
  startOfMonth,
  startOfWeek,
  constrainDate,
  today,
} from "./date.ts";

describe("CalendarDate", () => {
  test("is its year, month and day, and prints as ISO 8601", () => {
    const date = new CalendarDate(2024, 3, 7);
    expect(date.toString()).toBe("2024-03-07");
  });

  test("a year before the common era keeps its sign", () => {
    expect(new CalendarDate(-44, 3, 15).toString()).toBe("-0044-03-15");
  });

  test("the epoch day is what comparisons reduce to", () => {
    expect(new CalendarDate(1970, 1, 1).epochDay).toBe(0);
    expect(new CalendarDate(1970, 1, 2).epochDay).toBe(1);
    expect(new CalendarDate(1969, 12, 31).epochDay).toBe(-1);
    expect(new CalendarDate(2024, 3, 7).epochDay).toBe(19789);
  });

  test("adding days crosses months and years", () => {
    expect(new CalendarDate(2024, 1, 31).add({ days: 1 }).toString()).toBe("2024-02-01");
    expect(new CalendarDate(2023, 12, 31).add({ days: 1 }).toString()).toBe("2024-01-01");
    expect(new CalendarDate(2024, 3, 1).subtract({ days: 1 }).toString()).toBe("2024-02-29");
  });

  test("adding a month keeps the day inside the month it lands in", () => {
    // Not the 3rd of March: "a month later" than the 31st of January is the
    // last day February has.
    expect(new CalendarDate(2023, 1, 31).add({ months: 1 }).toString()).toBe("2023-02-28");
    expect(new CalendarDate(2024, 1, 31).add({ months: 1 }).toString()).toBe("2024-02-29");
  });

  test("months are added before days", () => {
    // One month lands on the 28th; the day is then added to THAT.
    expect(new CalendarDate(2023, 1, 31).add({ months: 1, days: 1 }).toString()).toBe("2023-03-01");
  });

  test("adding months rolls the year over", () => {
    expect(new CalendarDate(2024, 11, 15).add({ months: 3 }).toString()).toBe("2025-02-15");
    expect(new CalendarDate(2024, 2, 15).subtract({ months: 3 }).toString()).toBe("2023-11-15");
  });

  test("setting a field constrains the day to the resulting month", () => {
    expect(new CalendarDate(2024, 1, 31).set({ month: 2 }).toString()).toBe("2024-02-29");
    expect(new CalendarDate(2024, 1, 31).set({ year: 2023, month: 2 }).toString()).toBe(
      "2023-02-28",
    );
  });

  test("cycling a field wraps within itself and leaves the others alone", () => {
    // What the up arrow in a date field's month segment does.
    expect(new CalendarDate(2024, 12, 15).cycle("month", 1).toString()).toBe("2024-01-15");
    expect(new CalendarDate(2024, 1, 15).cycle("month", -1).toString()).toBe("2024-12-15");
    expect(new CalendarDate(2024, 3, 31).cycle("day", 1).toString()).toBe("2024-03-01");
  });

  test("comparing answers with the difference in days", () => {
    const a = new CalendarDate(2024, 3, 7);
    expect(a.compare(new CalendarDate(2024, 3, 8))).toBeLessThan(0);
    expect(a.compare(new CalendarDate(2024, 3, 7))).toBe(0);
    expect(a.compare(new CalendarDate(2024, 3, 1))).toBe(6);
  });

  test("a round trip through a `Date` keeps the day", () => {
    const date = new CalendarDate(2024, 3, 7);
    const native = date.toDate();
    expect(native.getFullYear()).toBe(2024);
    expect(native.getMonth()).toBe(2);
    expect(native.getDate()).toBe(7);
    expect(native.getHours()).toBe(0);
  });
});

describe("the calendar itself", () => {
  test("leap years are every four, not every hundred, but every four hundred", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  test("February has the length its year gives it", () => {
    expect(getDaysInMonth(2024, 2)).toBe(29);
    expect(getDaysInMonth(2023, 2)).toBe(28);
    expect(getDaysInMonth(2024, 1)).toBe(31);
    expect(getDaysInMonth(2024, 4)).toBe(30);
  });

  test("the day of the week is Sunday-first, and shifts with the week start", () => {
    // 2024-03-07 was a Thursday.
    expect(getDayOfWeek(new CalendarDate(2024, 3, 7))).toBe(4);
    expect(getDayOfWeek(new CalendarDate(2024, 3, 7), 1)).toBe(3);
  });

  test("a month knows its ends and a week knows its own", () => {
    const date = new CalendarDate(2024, 3, 7);
    expect(startOfMonth(date).toString()).toBe("2024-03-01");
    expect(endOfMonth(date).toString()).toBe("2024-03-31");
    expect(startOfWeek(date).toString()).toBe("2024-03-03");
    expect(endOfWeek(date).toString()).toBe("2024-03-09");
    expect(startOfWeek(date, 1).toString()).toBe("2024-03-04");
  });

  test("a month spans as many week rows as it needs", () => {
    // March 2024 begins on a Friday and has 31 days: six rows.
    expect(getWeeksInMonth(new CalendarDate(2024, 3, 1))).toBe(6);
    // February 2021 begins on a Monday and has 28: exactly four.
    expect(getWeeksInMonth(new CalendarDate(2021, 2, 1), 1)).toBe(4);
  });

  test("two days are the same day only if all three fields agree", () => {
    expect(isSameDay(new CalendarDate(2024, 3, 7), new CalendarDate(2024, 3, 7))).toBe(true);
    expect(isSameDay(new CalendarDate(2024, 3, 7), new CalendarDate(2023, 3, 7))).toBe(false);
    expect(isSameMonth(new CalendarDate(2024, 3, 7), new CalendarDate(2024, 3, 31))).toBe(true);
  });
});

describe("Time", () => {
  test("prints as ISO 8601, with milliseconds only when it has them", () => {
    expect(new Time(9, 5).toString()).toBe("09:05:00");
    expect(new Time(9, 5, 3, 40).toString()).toBe("09:05:03.040");
  });

  test("cycling wraps within the field", () => {
    expect(new Time(23, 59).cycle("hour", 1).toString()).toBe("00:59:00");
    expect(new Time(0, 0).cycle("minute", -1).toString()).toBe("00:59:00");
  });

  test("cycling with rounding lands on the step", () => {
    expect(new Time(9, 7).cycle("minute", 15, { round: true }).minute).toBe(15);
    expect(new Time(9, 7).cycle("minute", -15, { round: true }).minute).toBe(0);
  });
});

describe("CalendarDateTime", () => {
  test("is both, and prints as both", () => {
    expect(new CalendarDateTime(2024, 3, 7, 9, 5).toString()).toBe("2024-03-07T09:05:00");
  });

  test("adding days leaves the time alone", () => {
    const at = new CalendarDateTime(2024, 3, 7, 9, 5).add({ days: 1 });
    expect(at.toString()).toBe("2024-03-08T09:05:00");
  });

  test("comparing falls through to the time when the day matches", () => {
    const morning = new CalendarDateTime(2024, 3, 7, 9, 0);
    const evening = new CalendarDateTime(2024, 3, 7, 18, 0);
    expect(morning.compare(evening)).toBeLessThan(0);
    expect(morning.compare(new CalendarDateTime(2024, 3, 8, 1, 0))).toBeLessThan(0);
  });
});

describe("parsing", () => {
  test("reads ISO dates, times and both", () => {
    expect(parseDate("2024-03-07").toString()).toBe("2024-03-07");
    expect(parseTime("09:05").toString()).toBe("09:05:00");
    expect(parseDateTime("2024-03-07T09:05:03").toString()).toBe("2024-03-07T09:05:03");
  });

  test("anything else throws rather than answering with a wrong date", () => {
    expect(() => parseDate("7/3/2024")).toThrow(RangeError);
    expect(() => parseDate("2024-3-7")).toThrow(RangeError);
    expect(() => parseTime("9:05")).toThrow(RangeError);
  });
});

describe("constrainDate", () => {
  test("holds a value between its bounds", () => {
    const min = new CalendarDate(2024, 3, 1);
    const max = new CalendarDate(2024, 3, 31);

    expect(constrainDate(new CalendarDate(2024, 2, 1), min, max).toString()).toBe("2024-03-01");
    expect(constrainDate(new CalendarDate(2024, 4, 1), min, max).toString()).toBe("2024-03-31");
    expect(constrainDate(new CalendarDate(2024, 3, 15), min, max).toString()).toBe("2024-03-15");
  });

  test("a date and time keeps its time when the day is pulled into range", () => {
    const value = new CalendarDateTime(2024, 2, 1, 9, 30);
    const constrained = constrainDate(value, new CalendarDate(2024, 3, 1));
    expect(constrained.toString()).toBe("2024-03-01T09:30:00");
  });
});

describe("week numbers", () => {
  test("an ISO week begins on Monday and belongs to the year its Thursday is in", () => {
    // 2021-01-03 was a Sunday, so it closes the last week of 2020.
    expect(getISOWeek(new CalendarDate(2021, 1, 3))).toBe(53);
    expect(getISOWeek(new CalendarDate(2021, 1, 4))).toBe(1);
    expect(getISOWeek(new CalendarDate(2024, 3, 7))).toBe(10);
    // 2024-12-30 is a Monday whose Thursday is in 2025.
    expect(getISOWeek(new CalendarDate(2024, 12, 30))).toBe(1);
  });

  test("a locale week counts from the week that holds the first of January", () => {
    // Sunday-first, and the week holding 1 January is week 1 however short.
    expect(getWeekOfYear(new CalendarDate(2024, 1, 1))).toBe(1);
    expect(getWeekOfYear(new CalendarDate(2024, 1, 7))).toBe(2);
    expect(getWeekOfYear(new CalendarDate(2024, 3, 7))).toBe(10);
    // The last days of December already sit in the next year's first week.
    expect(getWeekOfYear(new CalendarDate(2024, 12, 31))).toBe(1);
  });

  test("the ISO rule is the general one with Monday and a four-day first week", () => {
    for (const date of [new CalendarDate(2021, 1, 3), new CalendarDate(2026, 10, 13)]) {
      expect(getWeekOfYear(date, 1, 4)).toBe(getISOWeek(date));
    }
  });
});

describe("today in a time zone", () => {
  test("two zones a day apart disagree about the date", () => {
    // UTC+14 and UTC-11 are 25 hours apart, so no instant is the same day in both.
    const ahead = today("Pacific/Kiritimati");
    const behind = today("Pacific/Pago_Pago");
    expect(ahead.compare(behind)).toBeGreaterThanOrEqual(1);
  });

  test("with no zone it is the local day", () => {
    const at = new Date();
    expect(today().toString()).toBe(
      new CalendarDate(at.getFullYear(), at.getMonth() + 1, at.getDate()).toString(),
    );
  });
});

describe("what a locale says about its week", () => {
  test("the first day is the locale's, not Sunday everywhere", () => {
    expect(getFirstDayOfWeek("en-US")).toBe(0);
    expect(getFirstDayOfWeek("en-GB")).toBe(1);
    expect(getFirstDayOfWeek("ar-EG")).toBe(6);
  });

  test("how much of a week must be in the year for it to be the first", () => {
    expect(getMinimalDaysInFirstWeek("en-US")).toBe(1);
    expect(getMinimalDaysInFirstWeek("de-DE")).toBe(4);
  });
});
