import { describe, expect, test } from "bun:test";
import { flush, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, tick, user, within } from "@barqjs/testing";

import { hydrates, wears } from "../test-arc.ts";
import { ComboChart, comboChartStyles } from "./combo-chart.tsx";

const DATA = [
  { day: "Mon", runs: 120, rate: 0.02 },
  { day: "Tue", runs: 180, rate: 0.05 },
  { day: "Wed", runs: 150, rate: 0.01 },
];

const BARS = [{ key: "runs", label: "Runs" }];
const LINES = [{ key: "rate", label: "Failure rate", tone: "danger" as const }];

async function drawn(): Promise<SVGSVGElement> {
  await tick();
  flush();
  return document.querySelector('[data-slot="combo-chart"] svg') as SVGSVGElement;
}

describe("ComboChart", () => {
  test("draws a bar per column and a line over them, each in its series' colour", async () => {
    render(() => <ComboChart label="Runs" data={DATA} x="day" bars={BARS} lines={LINES} />);
    const svg = await drawn();
    expect(svg.getAttribute("aria-label")).toBe("Runs");
    const bars = [...svg.querySelectorAll("rect")].filter(
      (rect) => rect.getAttribute("fill") === "var(--color-runs)",
    );
    expect(bars.length).toBe(3);
    const strokes = [...svg.querySelectorAll("path")].map((path) => path.getAttribute("stroke"));
    expect(strokes).toContain("var(--color-rate)");
    const chart = document.querySelector('[data-slot="chart"]') as HTMLElement;
    expect(chart.style.getPropertyValue("--color-rate")).toBe("var(--danger)");
    expect(chart.style.getPropertyValue("--color-runs")).toBe("var(--chart-1)");
  });

  test("a second axis at the end carries the lines' own scale", async () => {
    render(() => (
      <ComboChart
        label="Runs"
        data={DATA}
        x="day"
        bars={BARS}
        lines={LINES}
        dualAxis
        yLabel="Runs"
        y2Label="Rate"
      />
    ));
    const svg = await drawn();
    const texts = [...svg.querySelectorAll("text")];
    function at(words: string): number {
      return Number(texts.find((text) => text.textContent === words)?.getAttribute("x"));
    }
    expect(texts.map((text) => text.textContent)).toContain("Rate");
    expect(at("0.050")).toBeGreaterThan(at("Tue"));
    expect(at("180")).toBeLessThan(at("Mon"));
  });

  test("its numbers are a table, a row per column", async () => {
    render(() => (
      <ComboChart label="Runs" data={DATA} x="day" xLabel="Day" bars={BARS} lines={LINES} />
    ));
    await drawn();
    const table = screen.getByRole("table", { name: "Runs" });
    expect([...table.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual([
      "Day",
      "Runs",
      "Failure rate",
    ]);
    expect(table.querySelector("tbody tr")?.textContent).toBe("Mon1200.02");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the arrow keys walk the columns and the tooltip compares every series", async () => {
    render(() => <ComboChart label="Runs" data={DATA} x="day" bars={BARS} lines={LINES} />);
    const svg = await drawn();
    svg.focus();
    flush();
    expect(document.querySelector('[data-slot="chart-tooltip-label"]')?.textContent).toBe("Mon");
    function rows() {
      return [...document.querySelectorAll('[data-slot="chart-tooltip-row"]')].map(
        (row) => row.textContent,
      );
    }
    expect(rows()).toEqual(["Runs120", "Failure rate0.02"]);
    user.keyDown("ArrowRight", { target: svg });
    flush();
    expect(document.querySelector('[data-slot="chart-tooltip-label"]')?.textContent).toBe("Tue");
    expect(rows()).toEqual(["Runs180", "Failure rate0.05"]);
  });

  test("stacks its bars on request", async () => {
    render(() => (
      <ComboChart
        label="Runs"
        data={DATA}
        x="day"
        stacked
        bars={[
          { key: "runs", label: "Runs" },
          { key: "rate", label: "Rate" },
        ]}
      />
    ));
    const svg = await drawn();
    function first(fill: string): Element | undefined {
      return [...svg.querySelectorAll("rect")].find((rect) => rect.getAttribute("fill") === fill);
    }
    expect(first("var(--color-runs)")?.getAttribute("x")).toBe(
      first("var(--color-rate)")?.getAttribute("x") ?? "",
    );
  });

  test("writes its numbers in the reader's locale, right to left", async () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <ComboChart label="التشغيل" data={DATA} x="day" bars={BARS} />
      </Arabic>
    ));
    await drawn();
    expect(document.querySelector('[data-slot="chart-table-cell"]')?.textContent).toBe("١٢٠");
  });

  test("takes a class per part and a slot on every part", async () => {
    render(() => (
      <ComboChart
        label="Runs"
        data={DATA}
        x="day"
        bars={BARS}
        class="mine"
        table="visible"
        classes={{ root: "r", chart: "c", plot: "p", table: "t", header: "h", cell: "x" }}
      />
    ));
    await drawn();
    const pairs: [string, string][] = [
      ["combo-chart", "r"],
      ["chart", "c"],
      ["combo-chart-plot", "p"],
      ["chart-table", "t"],
      ["chart-table-header", "h"],
      ["chart-table-cell", "x"],
    ];
    for (const [slot, name] of pairs) {
      expect(document.querySelector(`[data-slot="${slot}"]`)?.classList.contains(name)).toBe(true);
    }
    const root = document.querySelector('[data-slot="combo-chart"]');
    expect(root?.classList.contains("mine")).toBe(true);
    expect(wears(root, comboChartStyles().root)).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { ComboChart } from "<arc>";
      export function Page() {
        return (
          <ComboChart
            label="Runs"
            data={[{ day: "Mon", runs: 1, rate: 2 }, { day: "Tue", runs: 3, rate: 1 }]}
            x="day"
            bars={[{ key: "runs", label: "Runs" }]}
            lines={[{ key: "rate", label: "Rate" }]}
            dualAxis
          />
        );
      }
    `);
    expect(result.container.querySelector("svg")?.getAttribute("aria-label")).toBe("Runs");
    result.unmount();
  });
});

const LATENCY = [
  { at: "09:00", p50: 120, p95: 300, outcome: "ok" },
  { at: "10:00", p50: 140, p95: 900, outcome: "failed" },
  { at: "11:00", p50: 100, p95: 280, outcome: "ok" },
];

const PERCENTILES = [
  { key: "p50", label: "p50" },
  { key: "p95", label: "p95", dashed: true, status: "outcome" },
];

const FAILED = { failed: { label: "Failed", tone: "danger" as const } };

function marks(svg: SVGSVGElement, prefix: string): Element[] {
  return [...svg.querySelectorAll(`[data-ts-key^="${prefix}"]:not(g)`)];
}

describe("ComboChart's marks", () => {
  test("a dashed line is dashed on the plot and in the legend", async () => {
    render(() => <ComboChart label="Latency" data={LATENCY} x="at" lines={PERCENTILES} />);
    const svg = await drawn();
    expect(marks(svg, "line-p95")[0]?.getAttribute("stroke-dasharray")).toBe("5 4");
    expect(marks(svg, "line-p50")[0]?.hasAttribute("stroke-dasharray")).toBe(false);
    const swatches = [...document.querySelectorAll('[data-slot="chart-legend-swatch"]')];
    expect(swatches.map((swatch) => swatch.hasAttribute("data-dashed"))).toEqual([false, true]);
  });

  test("a point's status is a dot in its tone, named in the legend, the tooltip and the table", async () => {
    render(() => (
      <ComboChart label="Latency" data={LATENCY} x="at" lines={PERCENTILES} statuses={FAILED} />
    ));
    const svg = await drawn();
    const dots = marks(svg, "status-p95-failed");
    expect(dots).toHaveLength(1);
    expect(dots[0]?.getAttribute("fill")).toBe("var(--color-status-failed)");
    const chart = document.querySelector('[data-slot="chart"]') as HTMLElement;
    expect(chart.style.getPropertyValue("--color-status-failed")).toBe("var(--danger)");
    expect(document.querySelector('[data-slot="chart-legend"]')?.textContent).toBe("p50p95Failed");
    const table = screen.getByRole("table", { name: "Latency" });
    expect([...table.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual([
      "at",
      "p50",
      "p95",
      "Status",
    ]);
    expect([...table.querySelectorAll("tbody tr")].map((row) => row.textContent)).toEqual([
      "09:00120300",
      "10:00140900Failed",
      "11:00100280",
    ]);
    svg.focus();
    flush();
    user.keyDown("ArrowRight", { target: svg });
    flush();
    const rows = [...document.querySelectorAll('[data-slot="chart-tooltip-row"]')].map(
      (row) => row.textContent,
    );
    expect(rows).toEqual(["p50140", "p95900, Failed"]);
  });

  test("a reference is a dashed rule and a band a faint range, each named in the legend", async () => {
    render(() => (
      <ComboChart
        label="Latency"
        data={LATENCY}
        x="at"
        lines={PERCENTILES}
        references={[{ value: 800, label: "Degraded above 800 ms", tone: "warning" }]}
        bands={[{ from: 0, to: 200, label: "Healthy" }]}
      />
    ));
    const svg = await drawn();
    const rule = marks(svg, "references-y")[0];
    expect(rule?.getAttribute("stroke-dasharray")).toBe("4 3");
    expect(rule?.getAttribute("stroke")).toBe("var(--color-reference-0)");
    expect(marks(svg, "band-0")[0]?.getAttribute("fill-opacity")).toBe("0.12");
    const chart = document.querySelector('[data-slot="chart"]') as HTMLElement;
    expect(chart.style.getPropertyValue("--color-reference-0")).toBe("var(--warning)");
    expect(chart.style.getPropertyValue("--color-band-0")).toBe("var(--success)");
    const items = [...document.querySelectorAll('[data-slot="chart-legend-item"]')];
    expect(items.map((item) => item.textContent)).toEqual([
      "p50",
      "p95",
      "Degraded above 800 ms",
      "Healthy",
    ]);
    expect(items[2]?.querySelector("[data-dashed]")).not.toBeNull();
  });

  test("annotations are numbered on the plot and listed under it", async () => {
    render(() => (
      <ComboChart
        label="Latency"
        data={LATENCY}
        x="at"
        lines={PERCENTILES}
        annotations={[
          { x: "10:00", label: "Deploy", series: "p95" },
          { x: "11:00", label: "Rolled back" },
        ]}
      />
    ));
    const svg = await drawn();
    expect(marks(svg, "note-marks").map((mark) => mark.textContent)).toEqual(["1"]);
    expect(marks(svg, "note-rule-marks").map((mark) => mark.textContent)).toEqual(["2"]);
    expect(marks(svg, "note-rules")).toHaveLength(1);
    const notes = screen.getByRole("list", { name: "Notes on the chart" });
    expect(
      [...notes.querySelectorAll('[data-slot="combo-chart-note"]')].map((note) => note.textContent),
    ).toEqual(["110:00Deploy", "211:00Rolled back"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("round ticks from zero in the axis's own format, in a box of the height asked", async () => {
    render(() => (
      <ComboChart
        height={240}
        label="Latency"
        data={LATENCY}
        x="at"
        lines={PERCENTILES}
        yTicks="nice"
        yFormat="duration"
      />
    ));
    const svg = await drawn();
    expect(marks(svg, "y-tick-label").map((label) => label.textContent)).toEqual([
      "0",
      "0.25 sec",
      "0.50 sec",
      "0.75 sec",
      "1.00 sec",
    ]);
    const box = document.querySelector<HTMLElement>('[data-slot="chart"]');
    expect(box?.style.getPropertyValue("height")).toBe("240px");
    expect(box?.style.getPropertyValue("aspect-ratio")).toBe("auto");
  });

  test("its legend filters: a chip per series hides it, and the caller may hold what is hidden", async () => {
    const changes: (readonly string[])[] = [];
    render(() => (
      <ComboChart
        label="Latency"
        data={LATENCY}
        x="at"
        lines={PERCENTILES}
        legend="filter"
        defaultHidden={["p50"]}
        onHiddenChange={(next) => changes.push(next)}
      />
    ));
    const svg = await drawn();
    expect(marks(svg, "line-p50")).toHaveLength(0);
    expect(marks(svg, "line-p95")).toHaveLength(1);
    const chips = screen.getByRole("group", { name: "Series" });
    const p50 = within(chips).getByRole("button", { name: "p50" });
    expect(p50.getAttribute("aria-pressed")).toBe("false");
    user.click(p50);
    await drawn();
    expect(changes).toEqual([[]]);
    expect(marks(await drawn(), "line-p50")).toHaveLength(1);
    expect(
      screen.getByRole("table", { name: "Latency" }).querySelectorAll("thead th"),
    ).toHaveLength(3);
  });

  test("hydrates its marks as the server wrote them", async () => {
    const result = await hydrates(`
      import { ComboChart } from "<arc>";
      export function Page() {
        return (
          <ComboChart
            label="Latency"
            data={[{ at: "a", p95: 3, outcome: "failed" }, { at: "b", p95: 1, outcome: "ok" }]}
            x="at"
            lines={[{ key: "p95", label: "p95", dashed: true, status: "outcome" }]}
            statuses={{ failed: { label: "Failed", tone: "danger" } }}
            references={[{ value: 2, label: "Budget" }]}
            annotations={[{ x: "b", label: "Deploy" }]}
            legend="filter"
            yTicks="nice"
          />
        );
      }
    `);
    expect(result.container.querySelector('[data-slot="combo-chart-notes"]')).not.toBeNull();
    result.unmount();
  });
});
