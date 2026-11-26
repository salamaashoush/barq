import { numberFormatter } from "@barqjs/aria/i18n";

/**
 * How a value axis writes its ticks: plain numbers, counts (compact past ten
 * thousand), durations given in ms (in ms, or in seconds once the axis
 * reaches one), shares of one as percentages, or the caller's own words.
 */
export type AxisFormat = "number" | "count" | "duration" | "percent" | ((value: number) => string);

/** A value axis's ticks: where they fall, and what each says. */
export interface AxisTicks {
  readonly values: readonly number[];
  readonly format: (value: number) => string;
}

export interface NiceTicksOptions {
  /** The smallest step to use, so a count never ticks at a half. @default 1 */
  minStep?: number;
  /** The most intervals to draw. @default 4 */
  maxIntervals?: number;
}

/**
 * Ticks from zero to past `max` on a round step (1, 2, 2.5 or 5 times a power
 * of ten), three or four intervals of it, so every label is distinct and
 * round at any scale: a library's own tick count picks fractional steps that
 * collapse once rounded ("1 ms" twice under 3 ms).
 *
 * ```ts
 * niceTicks(870); // [0, 250, 500, 750, 1000]
 * niceTicks(3); // [0, 1, 2, 3]
 * ```
 */
export function niceTicks(max: number, options: NiceTicksOptions = {}): number[] {
  const minStep = options.minStep ?? 1;
  const most = Math.max(3, options.maxIntervals ?? 4);
  const top = Number.isFinite(max) ? Math.max(max, 0) : 0;
  for (let magnitude = minStep; ; magnitude *= 10) {
    const multiples = magnitude >= 10 * minStep ? [1, 2, 2.5, 5] : [1, 2, 5];
    for (const multiple of multiples) {
      const step = multiple * magnitude;
      const intervals = Math.max(3, Math.ceil(top / step));
      if (intervals <= most) {
        return Array.from({ length: intervals + 1 }, (_, at) =>
          Number((at * step).toPrecision(12)),
        );
      }
    }
  }
}

/** The decimals a step needs to be written exactly, in `unit`s. */
function decimalsOf(step: number, unit: number): number {
  const scaled = step / unit;
  for (let decimals = 0; decimals < 3; decimals++) {
    if (Math.abs(Math.round(scaled * 10 ** decimals) - scaled * 10 ** decimals) < 1e-9) {
      return decimals;
    }
  }
  return 3;
}

/**
 * Writes an axis's ticks in the locale in scope. Call it in a component, as
 * every hook is; what it returns turns a format and the ticks into words.
 */
export function useAxisFormat(): (
  format: AxisFormat,
  ticks: readonly number[],
) => (value: number) => string {
  const plain = numberFormatter();
  const compact = numberFormatter({ notation: "compact", maximumFractionDigits: 1 });
  const percent = numberFormatter({ style: "percent", maximumFractionDigits: 1 });
  const milliseconds = numberFormatter({
    style: "unit",
    unit: "millisecond",
    unitDisplay: "short",
  });
  const seconds = [0, 1, 2, 3].map((digits) =>
    numberFormatter({
      style: "unit",
      unit: "second",
      unitDisplay: "short",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }),
  );
  return (format, ticks) => {
    if (typeof format === "function") return format;
    if (format === "count") {
      return (value) => (Math.abs(value) >= 10_000 ? compact() : plain()).format(value);
    }
    if (format === "percent") return (value) => percent().format(value);
    if (format === "duration") {
      const top = Math.max(0, ...ticks);
      if (top < 1000) return (value) => milliseconds().format(value);
      const step = ticks.length > 1 ? Math.abs((ticks[1] ?? 0) - (ticks[0] ?? 0)) : 1000;
      const writer = seconds[decimalsOf(step, 1000)] ?? seconds[3];
      return (value) =>
        value === 0 ? plain().format(0) : (writer?.() ?? plain()).format(value / 1000);
    }
    return (value) => plain().format(value);
  };
}
