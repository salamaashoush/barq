/**
 * Dates as VALUES: a calendar day, a wall-clock time, the two together, and
 * the two together in a time zone.
 *
 * `Date` is an instant — a number of milliseconds — and every calendar bug in
 * every application comes from using one where a DAY was meant. "The 3rd of
 * March" is not an instant: it starts at a different moment in every time
 * zone, it has no hour, and adding a month to it is not adding 30 days. So:
 *
 * - {@link CalendarDate} is a day. No time, no zone.
 * - {@link Time} is an hour, a minute, a second. No day, no zone.
 * - {@link CalendarDateTime} is both, still with no zone: what a clock on the
 *   wall says, which is what a meeting invitation means.
 * - {@link ZonedDateTime} is both in an IANA zone, so it IS an instant, and
 *   adding an hour across a daylight-saving change lands on the hour the clock
 *   actually shows. A wall time a change skips or repeats is resolved as the
 *   `disambiguation` option says.
 *
 * All four are immutable: every operation returns a new one, so a value can be
 * held in a signal and compared by content.
 *
 * Each value carries its calendar system. Gregorian is the default; Japanese,
 * Buddhist, Taiwanese, Persian, Indian, the Islamic ones, Hebrew, Ethiopic and
 * Coptic change how many months a year has, which era a year belongs to and
 * where a year begins, and arithmetic respects them: a Hebrew leap year has
 * thirteen months, and a Japanese year rolls into a new era mid-year. A locale
 * names its calendar with `-u-ca-`, and {@link createCalendar} builds it.
 *
 * All of this is `@internationalized/date`, re-exported here. It is the
 * package React Aria's own calendar and date field are written against, so the
 * behaviour this package ports — eras in a date field, months in a Hebrew
 * year, a zone's offset in a time field — comes with the same arithmetic it
 * was designed for, rather than a second implementation that drifts from it.
 * What follows the re-export is what that package leaves out: week numbers,
 * and the typing a component needs to hand a caller back the kind of value it
 * was given.
 */

import {
  CalendarDate,
  CalendarDateTime,
  getDayOfWeek,
  GregorianCalendar,
  startOfWeek,
  startOfYear,
  toCalendar,
  toCalendarDate,
  type DateValue,
  type DayOfWeek,
  type Time,
  type ZonedDateTime,
} from "@internationalized/date";

export type {
  AnyCalendarDate,
  AnyDateTime,
  AnyTime,
  Calendar,
  CalendarIdentifier,
  CycleOptions,
  CycleTimeOptions,
  DateDuration,
  DateField,
  DateFields,
  DateTimeDuration,
  DateValue,
  DayOfWeek,
  Disambiguation,
  TimeDuration,
  TimeField,
  TimeFields,
} from "@internationalized/date";

export {
  BuddhistCalendar,
  CalendarDate,
  CalendarDateTime,
  CopticCalendar,
  createCalendar,
  DateFormatter,
  endOfMonth,
  endOfWeek,
  endOfYear,
  EthiopicAmeteAlemCalendar,
  EthiopicCalendar,
  fromAbsolute,
  fromDate,
  fromDateToLocal,
  getDayOfWeek,
  getHoursInDay,
  getLocalTimeZone,
  getMinimumDayInMonth,
  getMinimumMonthInYear,
  getWeeksInMonth,
  GregorianCalendar,
  HebrewCalendar,
  IndianCalendar,
  isEqualCalendar,
  isEqualDay,
  isEqualMonth,
  isEqualYear,
  isSameDay,
  isSameMonth,
  isSameYear,
  IslamicCivilCalendar,
  IslamicTabularCalendar,
  IslamicUmalquraCalendar,
  isToday,
  isWeekday,
  isWeekend,
  JapaneseCalendar,
  maxDate,
  minDate,
  now,
  parseAbsolute,
  parseAbsoluteToLocal,
  parseDate,
  parseDateTime,
  parseDuration,
  parseTime,
  parseZonedDateTime,
  PersianCalendar,
  resetLocalTimeZone,
  setLocalTimeZone,
  startOfMonth,
  startOfWeek,
  startOfYear,
  TaiwanCalendar,
  Time,
  toCalendar,
  toCalendarDate,
  toCalendarDateTime,
  today,
  toLocalTimeZone,
  toTime,
  toTimeZone,
  toZoned,
  ZonedDateTime,
} from "@internationalized/date";

/**
 * The kind of value a component hands back for the kind it was given.
 *
 * A calendar given a date and time answers with a date and time, its time
 * kept; one given a zoned value answers in that zone. Choosing a day is
 * choosing a day, not resetting the meeting to midnight.
 */
export type MappedDateValue<T> = T extends ZonedDateTime
  ? ZonedDateTime
  : T extends CalendarDateTime
    ? CalendarDateTime
    : T extends CalendarDate
      ? CalendarDate
      : never;

// ---------------------------------------------------------------------------
// Weeks of the year
// ---------------------------------------------------------------------------

interface WeekInfo {
  firstDay?: number;
  minimalDays?: number;
}

/**
 * What `Intl.Locale` knows about a locale's week, or nothing.
 *
 * The specification settled on a `getWeekInfo()` method after engines had
 * shipped a `weekInfo` getter, and each engine has one or the other.
 */
function weekInfo(locale: string): WeekInfo | undefined {
  if (typeof Intl.Locale !== "function") return undefined;
  try {
    const info: { getWeekInfo?: () => WeekInfo; weekInfo?: WeekInfo } = new Intl.Locale(locale);
    return typeof info.getWeekInfo === "function" ? info.getWeekInfo() : info.weekInfo;
  } catch {
    // A tag the engine will not take.
    return undefined;
  }
}

/** A Sunday, for reading which weekday a locale starts its week on. */
const SUNDAY = new CalendarDate(1970, 1, 4);

/**
 * How many days of a week must fall in a year for it to be that year's first.
 *
 * One in the United States, four wherever ISO 8601 is followed.
 * `Intl.Locale` stopped reporting this, so where the engine gives nothing a
 * week that begins on Monday is taken to be an ISO one. That is right for
 * Europe and wrong for a few Monday-first locales that count from 1 January.
 */
export function getMinimalDaysInFirstWeek(locale: string): number {
  const info = weekInfo(locale);
  if (info?.minimalDays !== undefined) return info.minimalDays;
  // `getDayOfWeek` numbers from the locale's first day, so a Sunday is 6 in a
  // Monday-first locale.
  return getDayOfWeek(SUNDAY, locale) === 6 ? 4 : 1;
}

/** The number of a day's week, counted in its own calendar's year. */
function weekNumber(
  value: DateValue,
  locale: string,
  firstDayOfWeek: DayOfWeek | undefined,
  minimalDays: number,
): number {
  const date = toCalendarDate(value);
  // The day of the new year the first week always holds is the one
  // `minimalDays` from its start; the week is the one around it.
  const firstWeekOf = (day: CalendarDate): CalendarDate =>
    startOfWeek(startOfYear(day).add({ days: minimalDays - 1 }), locale, firstDayOfWeek);

  let first = firstWeekOf(date.add({ years: 1 }));
  if (date.compare(first) < 0) {
    first = firstWeekOf(date);
    if (date.compare(first) < 0) first = firstWeekOf(date.subtract({ years: 1 }));
  }
  // `compare` between two days is the number of days between them.
  return Math.floor(date.compare(first) / 7) + 1;
}

/**
 * Which week of its year a day is in, as a locale numbers them.
 *
 * Two numbers decide it and locales disagree about both: the day a week begins
 * on, and how much of the first week must fall in January for it to count. The
 * United States begins on Sunday and counts the week holding 1 January; most
 * of Europe begins on Monday and counts the first with four days in the year.
 * A day at either end of a year can belong to a week of the year beside it.
 *
 * The year is the date's own calendar's, so a Hebrew date is numbered from
 * Tishri.
 */
export function getWeekOfYear(date: DateValue, locale: string, firstDayOfWeek?: DayOfWeek): number {
  return weekNumber(date, locale, firstDayOfWeek, getMinimalDaysInFirstWeek(locale));
}

/**
 * The ISO 8601 week: Monday first, and week 1 is the one holding 4 January.
 *
 * Gregorian whatever the date's calendar, because the standard is.
 */
export function getISOWeek(date: DateValue): number {
  const gregorian = toCalendar(toCalendarDate(date), new GregorianCalendar());
  return weekNumber(gregorian, "en-US", "mon", 4);
}

/** What a time field edits: a time alone, or the time of a date and time. */
export type TimeValue = Time | CalendarDateTime | ZonedDateTime;

/** The kind of time value a field hands back for the kind it was given. */
export type MappedTimeValue<T> = T extends ZonedDateTime
  ? ZonedDateTime
  : T extends CalendarDateTime
    ? CalendarDateTime
    : T extends Time
      ? Time
      : never;
