import { describe, expect, test } from "bun:test";
import { type Child, flush } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, tick, user } from "@barqjs/testing";

import { hydrates, wears } from "../test-arc.ts";
import { DonutChart, donutChartStyles } from "./donut-chart.tsx";

const DATA = [
  { key: "up", label: "Up", value: 42, tone: "success" as const },
  { key: "late", label: "Late", value: 5, tone: "warning" as const },
  { key: "down", label: "Down", value: 3, tone: "danger" as const },
];

async function drawn(): Promise<SVGSVGElement> {
  await tick();
  flush();
  return document.querySelector('[data-slot="donut-chart"] svg') as SVGSVGElement;
}

describe("DonutChart", () => {
  test("draws a slice per value in its tone, and the total in the hole", async () => {
    render(() => <DonutChart label="Checks" data={DATA} centreLabel="checks" />);
    const svg = await drawn();
    expect(svg.getAttribute("aria-label")).toBe("Checks");
    const fills = [...svg.querySelectorAll("path")].map((path) => path.getAttribute("fill"));
    expect(fills).toContain("var(--color-up)");
    expect(fills).toContain("var(--color-down)");
    const chart = document.querySelector('[data-slot="chart"]') as HTMLElement;
    expect(chart.style.getPropertyValue("--color-up")).toBe("var(--success)");
    expect(document.querySelector('[data-slot="donut-chart-centre-value"]')?.textContent).toBe(
      "50",
    );
    expect(document.querySelector('[data-slot="donut-chart-centre-label"]')?.textContent).toBe(
      "checks",
    );
  });

  test("its numbers are a table a screen reader reads, each with its share", async () => {
    render(() => <DonutChart label="Checks" data={DATA} />);
    await drawn();
    const table = screen.getByRole("table", { name: "Checks" });
    const rows = [...table.querySelectorAll("tbody tr")].map((row) => row.textContent);
    expect(rows).toEqual(["Up4284%", "Late510%", "Down36%"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a button shows the table and hides it again", async () => {
    render(() => <DonutChart label="Checks" data={DATA} table="toggle" />);
    await drawn();
    const toggle = screen.getByRole("button", { name: "Show data table" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const table = screen.getByRole("table");
    expect(toggle.getAttribute("aria-controls")).toBe(table.id);
    await user.click(toggle);
    flush();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toBe("Hide data table");
    user.tap(toggle);
    flush();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  test("the arrow keys walk the slices and the tooltip names each", async () => {
    render(() => <DonutChart label="Checks" data={DATA} />);
    const svg = await drawn();
    svg.focus();
    flush();
    const popup = document.querySelector('[data-slot="chart-tooltip-popup"]');
    expect(popup?.getAttribute("data-state")).toBe("open");
    const first = document.querySelector('[data-slot="chart-tooltip-row"]')?.textContent;
    user.keyDown("ArrowRight", { target: svg });
    flush();
    const second = document.querySelector('[data-slot="chart-tooltip-row"]')?.textContent;
    expect(new Set([first, second]).size).toBe(2);
    expect([first, second].every((row) => /^(Up42|Late5|Down3)$/.test(row ?? ""))).toBe(true);
  });

  test("writes its numbers in the reader's locale, right to left", async () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <DonutChart label="الفحوص" data={DATA} />
      </Arabic>
    ));
    await drawn();
    expect(document.querySelector('[data-slot="donut-chart-centre-value"]')?.textContent).toBe(
      "٥٠",
    );
    expect(document.querySelector('[data-slot="chart-table-cell"]')?.textContent).toBe("٤٢");
  });

  test("takes a class per part and a slot on every part", async () => {
    render(() => (
      <DonutChart
        label="Checks"
        data={DATA}
        class="mine"
        table="toggle"
        centreLabel="checks"
        classes={{
          root: "r",
          chart: "c",
          plot: "p",
          centre: "e",
          centreValue: "v",
          centreLabel: "l",
          toggle: "t",
          table: "b",
          caption: "a",
          header: "h",
          cell: "x",
        }}
      />
    ));
    await drawn();
    const pairs: [string, string][] = [
      ["donut-chart", "r"],
      ["chart", "c"],
      ["donut-chart-plot", "p"],
      ["donut-chart-centre", "e"],
      ["donut-chart-centre-value", "v"],
      ["donut-chart-centre-label", "l"],
      ["donut-chart-toggle", "t"],
      ["chart-table", "b"],
      ["chart-table-caption", "a"],
      ["chart-table-header", "h"],
      ["chart-table-cell", "x"],
    ];
    for (const [slot, name] of pairs) {
      expect(document.querySelector(`[data-slot="${slot}"]`)?.classList.contains(name)).toBe(true);
    }
    const root = document.querySelector('[data-slot="donut-chart"]');
    expect(root?.classList.contains("mine")).toBe(true);
    expect(wears(root, donutChartStyles().root)).toBe(true);
  });

  test("a centre of the caller's own element", async () => {
    render(() => (
      <DonutChart
        label="Checks"
        data={DATA}
        renders={{ centreValue: (part, value) => <strong {...part.props}>{value}</strong> }}
      />
    ));
    await drawn();
    expect(document.querySelector('[data-slot="donut-chart-centre-value"]')?.tagName).toBe(
      "STRONG",
    );
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { DonutChart } from "<arc>";
      export function Page() {
        return (
          <DonutChart
            label="Checks"
            data={[{ key: "up", label: "Up", value: 4 }, { key: "down", label: "Down", value: 1 }]}
          />
        );
      }
    `);
    expect(result.container.querySelector("svg")?.getAttribute("aria-label")).toBe("Checks");
    result.unmount();
  });
});
