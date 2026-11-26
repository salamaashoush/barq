import {
  type Accessor,
  createContext,
  getOwner,
  hasContext,
  install,
  useContext,
} from "@barqjs/core";
import { type ProvidedLocale, provideLocale, useLocale } from "@barqjs/aria/i18n";

/** The day a week starts on, as Unicode's `fw` keyword names it. */
export type WeekStart = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** How a reader reads times: the zone, the hour cycle and the first day of the week. */
export interface ReaderClock {
  /**
   * `"local"` is the reader's own zone, `"utc"` one clock for everyone, or an
   * IANA name. @default "local"
   */
  zone?: string;
  /**
   * The reader's own zone as the server knows it, from a cookie the browser
   * set, so a server writes local times in it rather than in UTC.
   */
  localZone?: string;
  /** A 12- or 24-hour clock, or the locale's. @default "auto" */
  hours?: "auto" | 12 | 24;
  /** The first day of a week in calendars, or the locale's. @default "auto" */
  weekStart?: "auto" | WeekStart;
}

const ClockContext = createContext<ReaderClock | null>(null, "ReaderClock");

/** `tag` with the clock's hour cycle and week start written into its Unicode extension. */
export function clockLocale(tag: string, clock: ReaderClock | undefined): string {
  if (clock === undefined) return tag;
  const hourCycle = clock.hours === 12 ? "h12" : clock.hours === 24 ? "h23" : undefined;
  let out = hourCycle === undefined ? tag : new Intl.Locale(tag, { hourCycle }).toString();
  const week = clock.weekStart;
  if (week !== undefined && week !== "auto") {
    out = out.replace(/-fw-[a-z]{3}/, "").replace(/-u$/, "");
    out = out.includes("-u-") ? out.replace("-u-", `-u-fw-${week}-`) : `${out}-u-fw-${week}`;
  }
  return out;
}

/**
 * The reader's clock for everything below: `FormattedDate`, `RelativeTime`
 * and the date fields write times in its zone and hour cycle, and calendars
 * start the week on its day. `<ArcProvider clock>` calls it for the page.
 * `locale` is the tag to write the clock into, the one in scope by default.
 * Returns the `lang` and `dir` for the element that wraps the subtree.
 */
export function provideReaderClock(
  clock: () => ReaderClock | undefined,
  locale?: () => string,
): ProvidedLocale {
  const outer = locale === undefined ? useLocale() : undefined;
  const owner = getOwner();
  if (owner !== null) install(owner, ClockContext, () => clock() ?? null);
  return provideLocale(() => clockLocale(locale?.() ?? outer?.().locale ?? "en-US", clock()));
}

/** The reader's clock in scope, or `undefined` where none was provided. */
export function useReaderClock(): Accessor<ReaderClock | undefined> {
  if (!hasContext(ClockContext)) return () => undefined;
  const clock = useContext(ClockContext);
  return () => clock() ?? undefined;
}

/** A clock as one cookie-safe string: `local.24.mon`. */
export function serializeReaderClock(clock: ReaderClock): string {
  return [
    encodeURIComponent(clock.zone ?? "local"),
    String(clock.hours ?? "auto"),
    clock.weekStart ?? "auto",
  ].join(".");
}

const WEEK_DAYS: ReadonlySet<string> = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

/** What `serializeReaderClock` wrote, with anything it does not recognise left at its default. */
export function parseReaderClock(text: string | undefined): ReaderClock {
  const [zone, hours, week] = (text ?? "").split(".");
  return {
    zone: zone === undefined || zone === "" ? "local" : decodeURIComponent(zone),
    hours: hours === "12" ? 12 : hours === "24" ? 24 : "auto",
    weekStart: WEEK_DAYS.has(week ?? "") ? (week as WeekStart) : "auto",
  };
}
