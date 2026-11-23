import { describe, expect, test } from "bun:test";
import {
  CalendarDate,
  createCalendar,
  getISOWeek,
  getMinimalDaysInFirstWeek,
  getWeekOfYear,
  HebrewCalendar,
  JapaneseCalendar,
  parseZonedDateTime,
  toCalendar,
  toZoned,
  CalendarDateTime,
  today,
} from "./date.ts";

describe("week numbers", () => {
  test("an ISO week begins on Monday and belongs to the year its Thursday is in", () => {
    // 2021-01-03 was a Sunday, so it closes the last week of 2020.
    expect(getISOWeek(new CalendarDate(2021, 1, 3))).toBe(53);
    expect(getISOWeek(new CalendarDate(2021, 1, 4))).toBe(1);
    expect(getISOWeek(new CalendarDate(2024, 3, 7))).toBe(10);
    // 2024-12-30 is a Monday whose Thursday is in 2025.
    expect(getISOWeek(new CalendarDate(2024, 12, 30))).toBe(1);
  });

  test("a US week counts from the week that holds the first of January", () => {
    // Sunday-first, and the week holding 1 January is week 1 however short.
    expect(getWeekOfYear(new CalendarDate(2024, 1, 1), "en-US")).toBe(1);
    expect(getWeekOfYear(new CalendarDate(2024, 1, 7), "en-US")).toBe(2);
    expect(getWeekOfYear(new CalendarDate(2024, 3, 7), "en-US")).toBe(10);
    // The last days of December already sit in the next year's first week.
    expect(getWeekOfYear(new CalendarDate(2024, 12, 31), "en-US")).toBe(1);
  });

  test("a German week is the ISO one", () => {
    for (const date of [
      new CalendarDate(2021, 1, 3),
      new CalendarDate(2024, 12, 30),
      new CalendarDate(2026, 10, 13),
    ]) {
      expect(getWeekOfYear(date, "de-DE")).toBe(getISOWeek(date));
    }
  });

  test("the week's first day can be given instead of the locale's", () => {
    // Saturday 2024-01-06: the second week when weeks begin on Saturday.
    expect(getWeekOfYear(new CalendarDate(2024, 1, 6), "en-US", "sat")).toBe(2);
    expect(getWeekOfYear(new CalendarDate(2024, 1, 6), "en-US")).toBe(1);
  });

  test("an ISO week is Gregorian whatever calendar the day is in", () => {
    const hebrew = toCalendar(new CalendarDate(2024, 3, 7), new HebrewCalendar());
    expect(getISOWeek(hebrew)).toBe(10);
  });

  test("a locale week counts from the start of the day's own year", () => {
    // 1 Tishri 5785 fell on Thursday 3 October 2024, the Hebrew new year.
    const newYear = toCalendar(new CalendarDate(2024, 10, 3), new HebrewCalendar());
    expect(newYear.month).toBe(1);
    expect(getWeekOfYear(newYear, "en-US")).toBe(1);
    expect(getWeekOfYear(newYear.add({ days: 3 }), "en-US")).toBe(2);
  });

  test("how much of a week must be in the year for it to be the first", () => {
    expect(getMinimalDaysInFirstWeek("en-US")).toBe(1);
    expect(getMinimalDaysInFirstWeek("de-DE")).toBe(4);
  });
});

// What the components build on, pinned as `@internationalized/date`'s own
// tests pin it, so an upgrade that changed it fails here rather than in a
// calendar grid.
describe("calendars and zones", () => {
  test("a Hebrew leap year has thirteen months, and an ordinary one twelve", () => {
    const hebrew = new HebrewCalendar();
    expect(hebrew.getMonthsInYear(new CalendarDate(hebrew, 5784, 1, 1))).toBe(13);
    expect(hebrew.getMonthsInYear(new CalendarDate(hebrew, 5785, 1, 1))).toBe(12);
  });

  test("a Japanese date belongs to an era, and the era changes mid-year", () => {
    const japanese = new JapaneseCalendar();
    const before = toCalendar(new CalendarDate(2019, 4, 30), japanese);
    const after = toCalendar(new CalendarDate(2019, 5, 1), japanese);
    expect([before.era, before.year]).toEqual(["heisei", 31]);
    expect([after.era, after.year]).toEqual(["reiwa", 1]);
    expect(before.add({ days: 1 }).era).toBe("reiwa");
  });

  test("a locale's calendar identifier builds its calendar", () => {
    expect(createCalendar("japanese").identifier).toBe("japanese");
    expect(createCalendar("hebrew").getEras()).toEqual(["AM"]);
  });

  test("adding an hour across the spring change lands on the hour the clock shows", () => {
    const before = parseZonedDateTime("2024-03-10T01:30[America/New_York]");
    const after = before.add({ hours: 1 });
    expect(after.toString()).toBe("2024-03-10T03:30:00-04:00[America/New_York]");
  });

  test("a wall time the autumn change repeats is resolved as asked", () => {
    const wall = new CalendarDateTime(2024, 11, 3, 1, 30);
    const zone = "America/New_York";
    expect(toZoned(wall, zone, "earlier").offset).toBe(-4 * 3600000);
    expect(toZoned(wall, zone, "later").offset).toBe(-5 * 3600000);
  });

  test("two zones a day apart disagree about today", () => {
    // UTC+14 and UTC-11 are 25 hours apart, so no instant is the same day in both.
    const ahead = today("Pacific/Kiritimati");
    const behind = today("Pacific/Pago_Pago");
    expect(ahead.compare(behind)).toBeGreaterThanOrEqual(1);
  });
});
