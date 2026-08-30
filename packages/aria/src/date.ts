/**
 * Dates as VALUES: a calendar day, a wall-clock time, and the two together.
 *
 * `Date` is an instant — a number of milliseconds — and every calendar bug in
 * every application comes from using one where a DAY was meant. "The 3rd of
 * March" is not an instant: it starts at a different moment in every time
 * zone, it has no hour, and adding a month to it is not adding 30 days. So:
 *
 * - {@link CalendarDate} is a year, a month and a day. No time, no zone.
 * - {@link Time} is an hour, a minute, a second. No day, no zone.
 * - {@link CalendarDateTime} is both. Still no zone: it is what a clock on the
 *   wall says, which is what a meeting invitation means.
 *
 * All three are immutable. Every operation returns a new one, so a value can
 * be held in a signal and compared by content.
 *
 * **The calendar is the proleptic Gregorian one, and only that.** Other
 * calendar systems — Hebrew, Islamic, Japanese, Buddhist — change the number
 * of months in a year and the era a year belongs to, and pretending to support
 * them by relabelling Gregorian months is worse than not supporting them.
 * Time zones are absent for the same reason: a correct implementation needs
 * the IANA database, and `Intl.DateTimeFormat` is the only piece of it a
 * browser exposes.
 */

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

export type DateUnit = "year" | "month" | "day";
export type TimeUnit = "hour" | "minute" | "second" | "millisecond";
export type DateTimeUnit = DateUnit | TimeUnit;

/** Whether a year has 366 days, in the proleptic Gregorian calendar. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function getDaysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return MONTH_LENGTHS[month - 1] ?? 30;
}

/**
 * Days since 1970-01-01, from a year, month and day.
 *
 * Arithmetic on the day NUMBER rather than on a `Date`, because `Date` applies
 * the local zone's offset and a date near a daylight-saving boundary then
 * lands on the wrong day.
 */
function toEpochDay(year: number, month: number, day: number): number {
  // Howard Hinnant's civil-from-days, inverted. Shifting the year to start in
  // March makes the leap day the LAST day of the year, which removes every
  // special case from the arithmetic.
  const shifted = month <= 2 ? year - 1 : year;
  const era = Math.floor((shifted >= 0 ? shifted : shifted - 399) / 400);
  const yearOfEra = shifted - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function fromEpochDay(epochDay: number): [number, number, number] {
  const shifted = epochDay + 719468;
  const era = Math.floor((shifted >= 0 ? shifted : shifted - 146096) / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const year = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthOfShiftedYear = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthOfShiftedYear + 2) / 5) + 1;
  const month = monthOfShiftedYear + (monthOfShiftedYear < 10 ? 3 : -9);
  return [month <= 2 ? year + 1 : year, month, day];
}

function pad(value: number, width: number): string {
  return String(Math.abs(value)).padStart(width, "0");
}

/** A day in the calendar. No time, no zone. */
export class CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;

  constructor(year: number, month: number, day: number) {
    this.year = year;
    this.month = month;
    this.day = day;
  }

  /** Days since 1970-01-01, which is what every comparison reduces to. */
  get epochDay(): number {
    return toEpochDay(this.year, this.month, this.day);
  }

  copy(): CalendarDate {
    return new CalendarDate(this.year, this.month, this.day);
  }

  /**
   * A field replaced, with the day CONSTRAINED to the resulting month.
   *
   * Setting the month of the 31st of January to February has to answer with a
   * day that exists; the 28th is the only sensible one, and silently producing
   * the 3rd of March is how "set the month" turns into "skip a month".
   */
  set(fields: Partial<Record<DateUnit, number>>): CalendarDate {
    const year = fields.year ?? this.year;
    const month = Math.min(Math.max(fields.month ?? this.month, 1), 12);
    const day = Math.min(fields.day ?? this.day, getDaysInMonth(year, month));
    return new CalendarDate(year, month, Math.max(day, 1));
  }

  /**
   * A duration added, months before days.
   *
   * The order matters and the standard fixes it: adding one month and one day
   * to the 31st of January is the 28th of February plus a day, not the 1st of
   * March plus a month.
   */
  add(duration: { years?: number; months?: number; weeks?: number; days?: number }): CalendarDate {
    let year = this.year + (duration.years ?? 0);
    let month = this.month + (duration.months ?? 0);

    year += Math.floor((month - 1) / 12);
    month = ((((month - 1) % 12) + 12) % 12) + 1;

    const day = Math.min(this.day, getDaysInMonth(year, month));
    const days = (duration.days ?? 0) + (duration.weeks ?? 0) * 7;
    if (days === 0) return new CalendarDate(year, month, day);

    const [nextYear, nextMonth, nextDay] = fromEpochDay(toEpochDay(year, month, day) + days);
    return new CalendarDate(nextYear, nextMonth, nextDay);
  }

  subtract(duration: {
    years?: number;
    months?: number;
    weeks?: number;
    days?: number;
  }): CalendarDate {
    return this.add({
      years: -(duration.years ?? 0),
      months: -(duration.months ?? 0),
      weeks: -(duration.weeks ?? 0),
      days: -(duration.days ?? 0),
    });
  }

  /**
   * One field stepped, wrapping within itself and leaving the others alone.
   *
   * What the up and down arrows in a date field do: December plus one is
   * January of the SAME year, because the user is editing the month segment
   * and not the date.
   */
  cycle(field: DateUnit, amount: number, options: { round?: boolean } = {}): CalendarDate {
    if (field === "year") {
      const year = this.year + amount;
      return this.set({ year, day: Math.min(this.day, getDaysInMonth(year, this.month)) });
    }

    const limit = field === "month" ? 12 : getDaysInMonth(this.year, this.month);
    let value = field === "month" ? this.month : this.day;

    if (options.round === true && amount !== 0) {
      // Rounding first: from 7 with a step of 5, up goes to 10 rather than 12.
      value = Math.floor(value / Math.abs(amount)) * Math.abs(amount);
      if (amount > 0) value += Math.abs(amount);
      else if (value === (field === "month" ? this.month : this.day)) value -= Math.abs(amount);
    } else {
      value += amount;
    }

    // Wraps within the field: 1 to 12 and back to 1.
    value = ((((value - 1) % limit) + limit) % limit) + 1;
    return field === "month" ? this.set({ month: value, day: this.day }) : this.set({ day: value });
  }

  compare(other: CalendarDate | CalendarDateTime): number {
    const day = other instanceof CalendarDateTime ? other.date : other;
    return this.epochDay - day.epochDay;
  }

  /** ISO 8601, which is what a form submits and a URL carries. */
  toString(): string {
    const sign = this.year < 0 ? "-" : "";
    return `${sign}${pad(this.year, 4)}-${pad(this.month, 2)}-${pad(this.day, 2)}`;
  }

  /** Midnight on this day, in the LOCAL zone. The one place a zone enters. */
  toDate(): Date {
    const date = new Date(0);
    date.setFullYear(this.year, this.month - 1, this.day);
    date.setHours(0, 0, 0, 0);
    return date;
  }
}

/** A wall-clock time. No day, no zone. */
export class Time {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;

  constructor(hour = 0, minute = 0, second = 0, millisecond = 0) {
    this.hour = hour;
    this.minute = minute;
    this.second = second;
    this.millisecond = millisecond;
  }

  set(fields: Partial<Record<TimeUnit, number>>): Time {
    return new Time(
      fields.hour ?? this.hour,
      fields.minute ?? this.minute,
      fields.second ?? this.second,
      fields.millisecond ?? this.millisecond,
    );
  }

  /** One field stepped, wrapping within itself. 23:59 plus a minute is 23:00. */
  cycle(field: TimeUnit, amount: number, options: { round?: boolean } = {}): Time {
    const limits: Record<TimeUnit, number> = {
      hour: 24,
      minute: 60,
      second: 60,
      millisecond: 1000,
    };
    const limit = limits[field];
    let value = this[field];

    if (options.round === true && amount !== 0) {
      const step = Math.abs(amount);
      const rounded = Math.floor(value / step) * step;
      value = amount > 0 ? rounded + step : rounded === value ? value - step : rounded;
    } else {
      value += amount;
    }

    return this.set({ [field]: ((value % limit) + limit) % limit });
  }

  compare(other: Time): number {
    return (
      this.hour * 3600000 +
      this.minute * 60000 +
      this.second * 1000 +
      this.millisecond -
      (other.hour * 3600000 + other.minute * 60000 + other.second * 1000 + other.millisecond)
    );
  }

  toString(): string {
    const base = `${pad(this.hour, 2)}:${pad(this.minute, 2)}:${pad(this.second, 2)}`;
    return this.millisecond === 0 ? base : `${base}.${pad(this.millisecond, 3)}`;
  }
}

/** A day and a wall-clock time. Still no zone. */
export class CalendarDateTime {
  readonly date: CalendarDate;
  readonly time: Time;

  constructor(
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
    millisecond = 0,
  ) {
    this.date = new CalendarDate(year, month, day);
    this.time = new Time(hour, minute, second, millisecond);
  }

  static from(date: CalendarDate, time: Time = new Time()): CalendarDateTime {
    return new CalendarDateTime(
      date.year,
      date.month,
      date.day,
      time.hour,
      time.minute,
      time.second,
      time.millisecond,
    );
  }

  get year(): number {
    return this.date.year;
  }
  get month(): number {
    return this.date.month;
  }
  get day(): number {
    return this.date.day;
  }
  get hour(): number {
    return this.time.hour;
  }
  get minute(): number {
    return this.time.minute;
  }
  get second(): number {
    return this.time.second;
  }
  get millisecond(): number {
    return this.time.millisecond;
  }

  set(fields: Partial<Record<DateTimeUnit, number>>): CalendarDateTime {
    return CalendarDateTime.from(this.date.set(fields), this.time.set(fields));
  }

  add(duration: {
    years?: number;
    months?: number;
    weeks?: number;
    days?: number;
  }): CalendarDateTime {
    return CalendarDateTime.from(this.date.add(duration), this.time);
  }

  subtract(duration: {
    years?: number;
    months?: number;
    weeks?: number;
    days?: number;
  }): CalendarDateTime {
    return CalendarDateTime.from(this.date.subtract(duration), this.time);
  }

  cycle(field: DateTimeUnit, amount: number, options: { round?: boolean } = {}): CalendarDateTime {
    if (field === "year" || field === "month" || field === "day") {
      return CalendarDateTime.from(this.date.cycle(field, amount, options), this.time);
    }
    return CalendarDateTime.from(this.date, this.time.cycle(field, amount, options));
  }

  compare(other: CalendarDate | CalendarDateTime): number {
    const days = this.date.compare(other);
    if (days !== 0) return days;
    return other instanceof CalendarDateTime ? this.time.compare(other.time) : 0;
  }

  toString(): string {
    return `${this.date.toString()}T${this.time.toString()}`;
  }

  toDate(): Date {
    const date = this.date.toDate();
    date.setHours(this.hour, this.minute, this.second, this.millisecond);
    return date;
  }
}

export type DateValue = CalendarDate | CalendarDateTime;

// ---------------------------------------------------------------------------
// Reading and writing
// ---------------------------------------------------------------------------

const DATE_PATTERN = /^(-?\d{4,})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

/** An ISO date, or a throw naming what was given. */
export function parseDate(value: string): CalendarDate {
  const match = DATE_PATTERN.exec(value);
  if (match === null) throw new RangeError(`Not an ISO 8601 date: ${JSON.stringify(value)}`);
  return new CalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function parseTime(value: string): Time {
  const match = TIME_PATTERN.exec(value);
  if (match === null) throw new RangeError(`Not an ISO 8601 time: ${JSON.stringify(value)}`);
  return new Time(
    Number(match[1]),
    Number(match[2]),
    Number(match[3] ?? 0),
    Number((match[4] ?? "0").padEnd(3, "0")),
  );
}

export function parseDateTime(value: string): CalendarDateTime {
  const [date = "", time = "00:00"] = value.split("T");
  return CalendarDateTime.from(parseDate(date), parseTime(time));
}

/** Today, as the LOCAL zone reckons it. */
export function today(): CalendarDate {
  const at = new Date();
  return new CalendarDate(at.getFullYear(), at.getMonth() + 1, at.getDate());
}

/** The wall-clock time now, as the local zone reckons it. */
export function now(): Time {
  const at = new Date();
  return new Time(at.getHours(), at.getMinutes(), at.getSeconds(), at.getMilliseconds());
}

/** The day part of either kind of value. */
export function toCalendarDate(value: DateValue): CalendarDate {
  return value instanceof CalendarDateTime ? value.date : value;
}

// ---------------------------------------------------------------------------
// Weeks and months
// ---------------------------------------------------------------------------

/** 0 for Sunday, as `Date.getDay` numbers them. */
export function getDayOfWeek(date: DateValue, firstDayOfWeek = 0): number {
  const day = toCalendarDate(date);
  // 1970-01-01 was a Thursday, which is 4.
  const absolute = (((day.epochDay + 4) % 7) + 7) % 7;
  return (((absolute - firstDayOfWeek) % 7) + 7) % 7;
}

export function startOfMonth(date: DateValue): CalendarDate {
  const day = toCalendarDate(date);
  return new CalendarDate(day.year, day.month, 1);
}

export function endOfMonth(date: DateValue): CalendarDate {
  const day = toCalendarDate(date);
  return new CalendarDate(day.year, day.month, getDaysInMonth(day.year, day.month));
}

export function startOfWeek(date: DateValue, firstDayOfWeek = 0): CalendarDate {
  const day = toCalendarDate(date);
  return day.subtract({ days: getDayOfWeek(day, firstDayOfWeek) });
}

export function endOfWeek(date: DateValue, firstDayOfWeek = 0): CalendarDate {
  return startOfWeek(date, firstDayOfWeek).add({ days: 6 });
}

export function startOfYear(date: DateValue): CalendarDate {
  return new CalendarDate(toCalendarDate(date).year, 1, 1);
}

export function endOfYear(date: DateValue): CalendarDate {
  return new CalendarDate(toCalendarDate(date).year, 12, 31);
}

/**
 * How many week rows a month needs.
 *
 * Not always the same: a 31-day month beginning on the last day of a week
 * spans six rows, and a calendar sized for five leaves the last days off.
 */
export function getWeeksInMonth(date: DateValue, firstDayOfWeek = 0): number {
  const first = startOfMonth(date);
  const days = getDaysInMonth(first.year, first.month);
  return Math.ceil((getDayOfWeek(first, firstDayOfWeek) + days) / 7);
}

export function isSameDay(a: DateValue, b: DateValue): boolean {
  const left = toCalendarDate(a);
  const right = toCalendarDate(b);
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

export function isSameMonth(a: DateValue, b: DateValue): boolean {
  const left = toCalendarDate(a);
  const right = toCalendarDate(b);
  return left.year === right.year && left.month === right.month;
}

export function isToday(date: DateValue): boolean {
  return isSameDay(date, today());
}

/**
 * Which days a locale counts as the weekend.
 *
 * Not Saturday and Sunday everywhere: Friday and Saturday in much of the
 * Middle East, Sunday alone in parts of Asia. `Intl.Locale` knows, where the
 * browser implements it; the fallback is the most common pair.
 */
export function getWeekendDays(locale: string): number[] {
  const info = (
    Intl as unknown as { Locale?: new (tag: string) => { weekInfo?: { weekend?: number[] } } }
  ).Locale;
  if (info !== undefined) {
    try {
      // `weekInfo` numbers Monday as 1 and Sunday as 7; `getDay` numbers
      // Sunday as 0.
      const weekend = new info(locale).weekInfo?.weekend;
      if (weekend !== undefined) return weekend.map((day) => day % 7);
    } catch {
      // An engine without `weekInfo`, or a tag it will not take.
    }
  }
  return [0, 6];
}

export function isWeekend(date: DateValue, locale: string): boolean {
  return getWeekendDays(locale).includes(getDayOfWeek(date, 0));
}

/**
 * The first day of the week in a locale.
 *
 * Sunday in the United States, Monday across most of Europe, Saturday in much
 * of the Middle East. Getting it wrong shifts every date in the grid by a
 * column, which reads as the calendar being simply wrong.
 */
export function getFirstDayOfWeek(locale: string): number {
  const info = (
    Intl as unknown as {
      Locale?: new (tag: string) => { weekInfo?: { firstDay?: number } };
    }
  ).Locale;
  if (info !== undefined) {
    try {
      const first = new info(locale).weekInfo?.firstDay;
      if (first !== undefined) return first % 7;
    } catch {
      // As above.
    }
  }
  return 0;
}

/** `value` held between `min` and `max`, either of which may be absent. */
export function constrainDate<T extends DateValue>(
  value: T,
  minValue?: DateValue | null,
  maxValue?: DateValue | null,
): T {
  if (minValue !== undefined && minValue !== null && value.compare(minValue) < 0) {
    return (
      value instanceof CalendarDateTime
        ? CalendarDateTime.from(toCalendarDate(minValue), value.time)
        : toCalendarDate(minValue)
    ) as T;
  }
  if (maxValue !== undefined && maxValue !== null && value.compare(maxValue) > 0) {
    return (
      value instanceof CalendarDateTime
        ? CalendarDateTime.from(toCalendarDate(maxValue), value.time)
        : toCalendarDate(maxValue)
    ) as T;
  }
  return value;
}

export function isDateUnavailable(
  date: DateValue,
  minValue?: DateValue | null,
  maxValue?: DateValue | null,
): boolean {
  if (minValue !== undefined && minValue !== null && date.compare(minValue) < 0) return true;
  if (maxValue !== undefined && maxValue !== null && date.compare(maxValue) > 0) return true;
  return false;
}
