import { describe, expect, test } from "bun:test";
import { flush, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, tick, user } from "@barqjs/testing";

import { hydrates, wears } from "../test-arc.ts";
import { Heatmap, heatShade, heatStep, heatmapStyles } from "./heatmap.tsx";

const DATA = [
  { day: "Mon", hour: "09", failures: 0 },
  { day: "Mon", hour: "10", failures: 4 },
  { day: "Tue", hour: "09", failures: 8 },
  { day: "Tue", hour: "10", failures: 2 },
];

async function drawn(): Promise<SVGSVGElement> {
  await tick();
  flush();
  return document.querySelector('[data-slot="heatmap"] svg') as SVGSVGElement;
}

describe("Heatmap", () => {
  test("shades each cell by the step its value falls in", async () => {
    render(() => (
      <Heatmap label="Failures" data={DATA} x="hour" y="day" value="failures" tone="danger" />
    ));
    const svg = await drawn();
    const fills = [...svg.querySelectorAll("rect")]
      .map((rect) => rect.getAttribute("fill") ?? "")
      .filter((fill) => fill.startsWith("color-mix"));
    expect(fills.length).toBe(4);
    expect(fills).toContain(heatShade("var(--danger)", 0, 5));
    expect(fills).toContain(heatShade("var(--danger)", 4, 5));
    expect(heatStep(4, [0, 8], 5)).toBe(2);
    expect(heatStep(8, [0, 8], 5)).toBe(4);
  });

  test("a key reads the shades from fewer to more", async () => {
    render(() => (
      <Heatmap label="Failures" data={DATA} x="hour" y="day" value="failures" steps={3} />
    ));
    await drawn();
    const legend = document.querySelector('[data-slot="heatmap-legend"]');
    expect(legend?.textContent).toBe("LessMore");
    expect(legend?.querySelectorAll('[data-slot="heatmap-legend-step"]').length).toBe(3);
  });

  test("its numbers are the same grid as a table", async () => {
    render(() => (
      <Heatmap label="Failures" data={DATA} x="hour" y="day" value="failures" yLabel="Day" />
    ));
    await drawn();
    const table = screen.getByRole("table", { name: "Failures" });
    expect([...table.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual([
      "Day",
      "09",
      "10",
    ]);
    expect([...table.querySelectorAll("tbody tr")].map((row) => row.textContent)).toEqual([
      "Mon04",
      "Tue82",
    ]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the arrow keys walk the cells and the tooltip reads each", async () => {
    render(() => (
      <Heatmap label="Failures" data={DATA} x="hour" y="day" value="failures" valueLabel="Failed" />
    ));
    const svg = await drawn();
    svg.focus();
    flush();
    function label() {
      return document.querySelector('[data-slot="chart-tooltip-label"]')?.textContent;
    }
    const first = label();
    expect(first).toMatch(/^(Mon|Tue) · (09|10)$/);
    expect(document.querySelector('[data-slot="chart-tooltip-row"]')?.textContent).toMatch(
      /^Failed\d$/,
    );
    user.keyDown("ArrowRight", { target: svg });
    flush();
    expect(label()).not.toBe(first);
  });

  test("writes its numbers in the reader's locale, right to left", async () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <Heatmap label="الإخفاقات" data={DATA} x="hour" y="day" value="failures" />
      </Arabic>
    ));
    await drawn();
    const cells = [...document.querySelectorAll('[data-slot="chart-table-cell"]')];
    expect(cells[1]?.textContent).toBe("٤");
  });

  test("takes a class per part and a slot on every part", async () => {
    render(() => (
      <Heatmap
        label="Failures"
        data={DATA}
        x="hour"
        y="day"
        value="failures"
        class="mine"
        classes={{ root: "r", chart: "c", plot: "p", legend: "l", legendStep: "s", table: "t" }}
      />
    ));
    await drawn();
    const pairs: [string, string][] = [
      ["heatmap", "r"],
      ["chart", "c"],
      ["heatmap-plot", "p"],
      ["heatmap-legend", "l"],
      ["heatmap-legend-step", "s"],
      ["chart-table", "t"],
    ];
    for (const [slot, name] of pairs) {
      expect(document.querySelector(`[data-slot="${slot}"]`)?.classList.contains(name)).toBe(true);
    }
    const root = document.querySelector('[data-slot="heatmap"]');
    expect(root?.classList.contains("mine")).toBe(true);
    expect(wears(root, heatmapStyles().root)).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { Heatmap } from "<arc>";
      export function Page() {
        return (
          <Heatmap
            label="Load"
            data={[{ a: "x", b: "y", v: 1 }, { a: "z", b: "y", v: 3 }]}
            x="a"
            y="b"
            value="v"
          />
        );
      }
    `);
    expect(result.container.querySelector('[data-slot="heatmap-legend"]')).not.toBeNull();
    result.unmount();
  });
});
