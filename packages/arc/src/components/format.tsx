import { createEffect, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import {
  dateFormatter,
  numberFormatter,
  relativeTimeFormatter,
  relativeUnit,
  useLocale,
} from "@barqjs/aria/i18n";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { type } from "../style/index.ts";
import { formatBytes } from "./file-upload.tsx";

export const formattedStyles = variants({
  slots: { root: arc({ whiteSpace: "nowrap" }) },
  variants: { numeric: { true: { root: type.numeric }, false: {} } },
  defaults: { numeric: true },
});

type Slots = ReturnType<typeof formattedStyles>;

interface FormattedProps extends Customisable<Slots> {
  id?: string;
  /** Figures of one width, so a column of them lines up. @default true */
  numeric?: boolean;
}

/** A moment as a `Date`, from a `Date`, epoch milliseconds or an ISO string. */
export type Moment = Date | number | string;

const toDate = (moment: Moment): Date => (moment instanceof Date ? moment : new Date(moment));

/** The calendar day a moment falls on in a zone, as `YYYY-MM-DD`, for grouping by day. */
export function dayKey(moment: Moment, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(toDate(moment));
}

/**
 * Whether this is the browser after hydration, when its own clock and time
 * zone may be read. The server and the hydrating page answer false, so they
 * write the same thing.
 */
function hydrated(): () => boolean {
  const [done, setDone] = createSignal(false, { ownedWrite: true });
  if (!isServer) {
    createEffect(
      () => true,
      () => {
        setDone(true);
      },
    );
  }
  return done;
}

export interface FormattedDateProps extends FormattedProps {
  value: Moment;
  /** @default `{ dateStyle: "medium" }` */
  options?: Omit<Intl.DateTimeFormatOptions, "timeZone">;
  /**
   * The zone it is written in. Left out, the server and the hydrating page
   * write it in UTC, and the browser then rewrites it in the reader's own zone.
   */
  timeZone?: string;
}

/**
 * A date, a time or both, written in the locale.
 *
 * ```tsx
 * <FormattedDate value={invoice.dueAt} />
 * <FormattedDate value={run.startedAt} options={{ timeStyle: "short" }} timeZone="Africa/Cairo" />
 * ```
 *
 * A `<time>` whose `datetime` is the ISO moment. Without a `timeZone` both
 * halves of a hydration agree on UTC and the reader's own zone follows.
 */
export function FormattedDate(props: FormattedDateProps) {
  const locale = useLocale();
  const local = hydrated();
  const zone = (): string | undefined => props.timeZone ?? (local() ? undefined : "UTC");
  const format = (): string => {
    const options = { ...(props.options ?? { dateStyle: "medium" as const }), timeZone: zone() };
    return dateFormatter(options, locale)().format(toDate(props.value));
  };
  const cls = (): Slots =>
    parts(formattedStyles({ numeric: props.numeric !== false }), props.classes);
  return (
    <time
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="formatted-date"
      datetime={toDate(props.value).toISOString()}
    >
      {format()}
    </time>
  );
}

export interface RelativeTimeProps extends FormattedProps {
  value: Moment;
  /**
   * The moment it is measured from while the page is drawn and hydrated: the
   * request's time, handed to both, so they write the same words. Left out,
   * the server and the hydrating page write the absolute date, and the
   * browser turns it relative.
   */
  now?: Moment;
  /** Kept up to date as time passes: each second under a minute, then less often. @default true */
  live?: boolean;
  /** `"auto"` writes "yesterday" and "now"; `"always"` writes "1 day ago". @default "auto" */
  wording?: "auto" | "always";
  /** @default "long" */
  length?: "long" | "short" | "narrow";
  /** The absolute moment in the title. @default `{ dateStyle: "long", timeStyle: "short" }` */
  titleOptions?: Omit<Intl.DateTimeFormatOptions, "timeZone">;
  timeZone?: string;
}

/** How long until a relative time could read differently. */
function refreshAfter(milliseconds: number): number {
  const size = Math.abs(milliseconds);
  if (size < 60_000) return 1000;
  if (size < 3_600_000) return 30_000;
  if (size < 86_400_000) return 300_000;
  return 3_600_000;
}

/**
 * A moment as how long ago or how soon it is: "3 minutes ago", "in 2 days".
 *
 * ```tsx
 * <RelativeTime value={comment.createdAt} />
 * <RelativeTime value={run.at} now={request.time} />
 * ```
 *
 * A `<time>` with the ISO moment in `datetime` and the absolute date and time
 * in its title, written by `Intl.RelativeTimeFormat` in the locale. It keeps
 * itself current, every second while under a minute and less often after,
 * and stops when it unmounts. Server and browser agree: on `now` when given,
 * otherwise on the absolute date, which the browser turns relative once it
 * has hydrated.
 */
export function RelativeTime(props: RelativeTimeProps) {
  const locale = useLocale();
  const local = hydrated();
  const [clock, setClock] = createSignal(0, { ownedWrite: true });
  const moment = (): Date => toDate(props.value);
  const reference = (): number | undefined => {
    if (local()) {
      clock();
      return Date.now();
    }
    return props.now === undefined ? undefined : toDate(props.now).getTime();
  };
  const zone = (): string | undefined => props.timeZone ?? (local() ? undefined : "UTC");
  const absolute = (): string =>
    dateFormatter(
      {
        ...(props.titleOptions ?? { dateStyle: "long" as const, timeStyle: "short" as const }),
        timeZone: zone(),
      },
      locale,
    )().format(moment());
  const relative = (): string => {
    const now = reference();
    if (now === undefined) return absolute();
    const { value, unit } = relativeUnit(moment().getTime() - now);
    return relativeTimeFormatter(
      { numeric: props.wording ?? "auto", style: props.length ?? "long" },
      locale,
    )().format(value, unit);
  };

  if (!isServer) {
    createEffect(
      () => [local(), clock(), props.live !== false] as const,
      ([ready, , live]) => {
        if (!ready || !live) return undefined;
        const timer = setTimeout(
          () => setClock((tick) => tick + 1),
          refreshAfter(moment().getTime() - Date.now()),
        );
        return () => clearTimeout(timer);
      },
    );
  }
  const cls = (): Slots =>
    parts(formattedStyles({ numeric: props.numeric === true }), props.classes);
  return (
    <time
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="relative-time"
      datetime={moment().toISOString()}
      title={absolute()}
    >
      {relative()}
    </time>
  );
}

export interface FormattedNumberProps extends FormattedProps {
  value: number;
  /** Anything `Intl.NumberFormat` takes: a percent, a unit, compact notation, a sign. */
  options?: Intl.NumberFormatOptions;
}

/**
 * A number written in the locale, with its digits and separators.
 *
 * ```tsx
 * <FormattedNumber value={0.125} options={{ style: "percent" }} />
 * <FormattedNumber value={18_400} options={{ notation: "compact" }} />
 * ```
 */
export function FormattedNumber(props: FormattedNumberProps) {
  const format = numberFormatter(props.options);
  const cls = (): Slots =>
    parts(formattedStyles({ numeric: props.numeric !== false }), props.classes);
  return (
    <span
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="formatted-number"
    >
      {format().format(props.value)}
    </span>
  );
}

export interface CurrencyProps extends FormattedProps {
  value: number;
  /** An ISO 4217 code: `"USD"`, `"EGP"`. */
  currency: string;
  /** @default "symbol" */
  display?: "symbol" | "narrowSymbol" | "code" | "name";
  /** `$18K` rather than `$18,400.00`. */
  compact?: boolean;
  /** `"exceptZero"` writes a sign on a gain as well as a loss. @default "auto" */
  sign?: Intl.NumberFormatOptions["signDisplay"];
  /** Negative amounts in brackets, as an account writes them. */
  accounting?: boolean;
}

/**
 * An amount of money, in the locale and the currency's own decimals.
 *
 * ```tsx
 * <Currency value={1234.5} currency="USD" />
 * <Currency value={-80} currency="EUR" accounting />
 * ```
 */
export function Currency(props: CurrencyProps) {
  const locale = useLocale();
  const text = (): string =>
    new Intl.NumberFormat(locale().locale, {
      style: "currency",
      currency: props.currency,
      currencyDisplay: props.display ?? "symbol",
      notation: props.compact === true ? "compact" : "standard",
      signDisplay: props.sign ?? "auto",
      currencySign: props.accounting === true ? "accounting" : "standard",
    }).format(props.value);
  const cls = (): Slots =>
    parts(formattedStyles({ numeric: props.numeric !== false }), props.classes);
  return (
    <span class={arc(cls().root, props.class, props.className)} id={props.id} data-slot="currency">
      {text()}
    </span>
  );
}

export interface BytesProps extends FormattedProps {
  /** A size in bytes. */
  value: number;
}

/**
 * A size as a person reads it: `2.4 MB`, in the locale's digits and unit
 * names, the same `formatBytes` an upload's list uses.
 */
export function Bytes(props: BytesProps) {
  const locale = useLocale();
  const cls = (): Slots =>
    parts(formattedStyles({ numeric: props.numeric !== false }), props.classes);
  return (
    <span class={arc(cls().root, props.class, props.className)} id={props.id} data-slot="bytes">
      {formatBytes(props.value, locale().locale)}
    </span>
  );
}

const DURATION_UNITS = [
  ["days", 86_400_000],
  ["hours", 3_600_000],
  ["minutes", 60_000],
  ["seconds", 1000],
  ["milliseconds", 1],
] as const;

type DurationUnit = (typeof DURATION_UNITS)[number][0];

/**
 * A span in milliseconds as the parts `Intl.DurationFormat` takes: `largest`
 * units from the first that is not zero, the last one rounded. Milliseconds
 * only for a span under a second.
 */
export function durationParts(
  milliseconds: number,
  largest = 2,
): Partial<Record<DurationUnit, number>> {
  let left = Math.abs(milliseconds);
  const scale = left > 0 && left < 1000 ? DURATION_UNITS : DURATION_UNITS.slice(0, -1);
  const first = scale.findIndex(([, size]) => left >= size);
  const picked = scale.slice(first < 0 ? scale.length - 1 : first).slice(0, largest);
  const out: Partial<Record<DurationUnit, number>> = {};
  picked.forEach(([unit, size], at) => {
    const amount = at === picked.length - 1 ? Math.round(left / size) : Math.floor(left / size);
    out[unit] = amount;
    left -= amount * size;
  });
  return out;
}

export interface DurationProps extends FormattedProps {
  /** How long, in milliseconds. */
  value: number;
  /** `"digital"` is `1:05:09`; the rest name each unit. @default "short" */
  length?: "long" | "short" | "narrow" | "digital";
  /** How many units, largest first: 2 writes `1 hr, 5 min`. @default 2 */
  units?: number;
}

export interface DurationTextOptions {
  /** @default "short" */
  length?: DurationProps["length"];
  /** @default 2 */
  units?: number;
  /** With `"digital"`, `"auto"` leaves the hours out while there are none: `01:05`. @default "always" */
  hours?: "always" | "auto";
}

/** What `Duration` writes, for a label or an attribute of an app's own. */
export function durationText(
  milliseconds: number,
  locale: string,
  options: DurationTextOptions = {},
): string {
  const seconds = Math.floor(Math.abs(milliseconds) / 1000);
  if (options.length === "digital") {
    return new Intl.DurationFormat(locale, {
      style: "digital",
      hoursDisplay: options.hours ?? "always",
    }).format({
      hours: Math.floor(seconds / 3600),
      minutes: Math.floor(seconds / 60) % 60,
      seconds: seconds % 60,
    });
  }
  return new Intl.DurationFormat(locale, { style: options.length ?? "short" }).format(
    durationParts(milliseconds, options.units ?? 2),
  );
}

/**
 * How long something took, written in the locale by `Intl.DurationFormat`.
 *
 * ```tsx
 * <Duration value={3_909_000} />            // 1 hr, 5 min
 * <Duration value={3_909_000} length="digital" />  // 1:05:09
 * ```
 */
export function Duration(props: DurationProps) {
  const locale = useLocale();
  const text = (): string =>
    durationText(props.value, locale().locale, { length: props.length, units: props.units });
  const cls = (): Slots =>
    parts(formattedStyles({ numeric: props.numeric !== false }), props.classes);
  return (
    <span class={arc(cls().root, props.class, props.className)} id={props.id} data-slot="duration">
      {text()}
    </span>
  );
}
