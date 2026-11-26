import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { render } from "@barqjs/testing";

import { type AxisFormat, niceTicks, useAxisFormat } from "./chart-axis.ts";

interface Written {
  format: AxisFormat;
  ticks: readonly number[];
}

function write(cases: readonly Written[], locale = "en-US"): string[][] {
  const out: string[][] = [];
  function Probe() {
    const axis = useAxisFormat();
    for (const one of cases) {
      const format = axis(one.format, one.ticks);
      out.push(one.ticks.map((tick) => format(tick)));
    }
    return null;
  }
  function Locale(props: ParentProps) {
    provideLocale(locale);
    return <>{props.children}</>;
  }
  render(() => (
    <Locale>
      <Probe />
    </Locale>
  ));
  return out;
}

describe("niceTicks", () => {
  test("three or four round steps from zero past the largest value", () => {
    expect(niceTicks(870)).toEqual([0, 250, 500, 750, 1000]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(2.4)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(0)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(41)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(12_480)).toEqual([0, 5000, 10_000, 15_000]);
  });

  test("never ticks below its smallest step, and draws more intervals on request", () => {
    expect(niceTicks(0.4, { minStep: 0.1 })).toEqual([0, 0.1, 0.2, 0.3, 0.4]);
    expect(niceTicks(870, { maxIntervals: 9 })).toEqual([
      0, 100, 200, 300, 400, 500, 600, 700, 800, 900,
    ]);
    expect(niceTicks(Number.NaN)).toEqual([0, 1, 2, 3]);
  });
});

describe("useAxisFormat", () => {
  test("durations in ms below a second, and in seconds with the decimals the step needs above", () => {
    const [short, long, whole] = write([
      { format: "duration", ticks: [0, 100, 200, 300] },
      { format: "duration", ticks: [0, 500, 1000, 1500] },
      { format: "duration", ticks: [0, 2000, 4000] },
    ]);
    expect(short).toEqual(["0 ms", "100 ms", "200 ms", "300 ms"]);
    expect(long).toEqual(["0", "0.5 sec", "1.0 sec", "1.5 sec"]);
    expect(whole).toEqual(["0", "2 sec", "4 sec"]);
  });

  test("counts compact past ten thousand, shares as percentages, and the caller's own words", () => {
    const [counts, shares, own, plain] = write([
      { format: "count", ticks: [0, 5000, 10_000, 15_000] },
      { format: "percent", ticks: [0, 0.5, 1] },
      { format: (value) => `${String(value)}x`, ticks: [1, 2] },
      { format: "number", ticks: [1250] },
    ]);
    expect(counts).toEqual(["0", "5,000", "10K", "15K"]);
    expect(shares).toEqual(["0%", "50%", "100%"]);
    expect(own).toEqual(["1x", "2x"]);
    expect(plain).toEqual(["1,250"]);
  });

  test("writes in the locale in scope", () => {
    const [counts] = write([{ format: "count", ticks: [0, 250] }], "ar-EG");
    expect(counts).toEqual(["٠", "٢٥٠"]);
  });
});
