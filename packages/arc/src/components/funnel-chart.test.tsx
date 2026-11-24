import { describe, expect, test } from "bun:test";
import { flush, type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, tick, user } from "@barqjs/testing";

import { hydrates, wears } from "../test-arc.ts";
import { FunnelChart, funnelChartStyles } from "./funnel-chart.tsx";

const DATA = [
  { key: "visit", label: "Visited", value: 1000 },
  { key: "start", label: "Started", value: 400 },
  { key: "done", label: "Signed up", value: 100, tone: "success" as const },
];

async function drawn(): Promise<SVGSVGElement> {
  await tick();
  flush();
  return document.querySelector('[data-slot="funnel-chart"] svg') as SVGSVGElement;
}

interface Bar {
  x: number;
  width: number;
  fill: string | null;
}

function bars(svg: SVGSVGElement): Bar[] {
  return [...svg.querySelectorAll("rect, path")]
    .filter((shape) => (shape.getAttribute("fill") ?? "").startsWith("var(--color-"))
    .map((shape) => {
      const box = shape.getAttribute("d") ?? "";
      const xs = [...box.matchAll(/[ML]([\d.]+),/g)].map((match) => Number(match[1]));
      const x = Number(shape.getAttribute("x") ?? Math.min(...xs));
      const width = Number(shape.getAttribute("width") ?? Math.max(...xs) - Math.min(...xs));
      return { x, width, fill: shape.getAttribute("fill") };
    });
}

interface BarSpan {
  x: number;
  width: number;
}

describe("FunnelChart", () => {
  test("narrows stage by stage around one centre line", async () => {
    render(() => <FunnelChart label="Sign-ups" data={DATA} />);
    const svg = await drawn();
    const [visit, start, done] = bars(svg);
    expect(visit?.width).toBeGreaterThan(start?.width ?? 0);
    expect(start?.width).toBeGreaterThan(done?.width ?? 0);
    function centre(bar: BarSpan | undefined): number {
      return (bar?.x ?? 0) + (bar?.width ?? 0) / 2;
    }
    expect(centre(start)).toBeCloseTo(centre(visit), 0);
    const chart = document.querySelector('[data-slot="chart"]') as HTMLElement;
    expect(chart.style.getPropertyValue("--color-visit")).toBe("var(--chart-1)");
    expect(chart.style.getPropertyValue("--color-done")).toBe("var(--success)");
  });

  test("writes each stage's value and share at its end, and its name on the axis", async () => {
    render(() => <FunnelChart label="Sign-ups" data={DATA} />);
    const svg = await drawn();
    const words = [...svg.querySelectorAll("text")].map((one) => one.textContent);
    expect(words).toContain("Signed up");
    expect(words).toContain("400 · 40%");
  });

  test("its numbers are a table with each share of the first stage", async () => {
    render(() => <FunnelChart label="Sign-ups" data={DATA} showValues={false} />);
    const svg = await drawn();
    expect([...svg.querySelectorAll("text")].map((one) => one.textContent)).not.toContain(
      "400 · 40%",
    );
    const table = screen.getByRole("table", { name: "Sign-ups" });
    expect([...table.querySelectorAll("tbody tr")].map((row) => row.textContent)).toEqual([
      "Visited1,000100%",
      "Started40040%",
      "Signed up10010%",
    ]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the arrow keys walk the stages and the tooltip reads each", async () => {
    render(() => <FunnelChart label="Sign-ups" data={DATA} />);
    const svg = await drawn();
    svg.focus();
    flush();
    function label() {
      return document.querySelector('[data-slot="chart-tooltip-label"]')?.textContent;
    }
    const seen = [label()];
    user.keyDown("ArrowDown", { target: svg });
    flush();
    seen.push(label());
    expect(new Set(seen).size).toBe(2);
    const rows = [...document.querySelectorAll('[data-slot="chart-tooltip-row"]')].map(
      (row) => row.textContent,
    );
    expect(rows.some((row) => row?.includes("of the first stage"))).toBe(true);
  });

  test("writes its numbers in the reader's locale, right to left", async () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <FunnelChart label="التسجيل" data={DATA} />
      </Arabic>
    ));
    await drawn();
    expect(document.querySelector('[data-slot="chart-table-cell"]')?.textContent).toBe("١٬٠٠٠");
  });

  test("takes a class per part and a slot on every part", async () => {
    render(() => (
      <FunnelChart
        label="Sign-ups"
        data={DATA}
        class="mine"
        classes={{ root: "r", chart: "c", plot: "p", table: "t", header: "h", cell: "x" }}
      />
    ));
    await drawn();
    const pairs: [string, string][] = [
      ["funnel-chart", "r"],
      ["chart", "c"],
      ["funnel-chart-plot", "p"],
      ["chart-table", "t"],
      ["chart-table-header", "h"],
      ["chart-table-cell", "x"],
    ];
    for (const [slot, name] of pairs) {
      expect(document.querySelector(`[data-slot="${slot}"]`)?.classList.contains(name)).toBe(true);
    }
    const root = document.querySelector('[data-slot="funnel-chart"]');
    expect(root?.classList.contains("mine")).toBe(true);
    expect(wears(root, funnelChartStyles().root)).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { FunnelChart } from "<arc>";
      export function Page() {
        return (
          <FunnelChart
            label="Sign-ups"
            data={[{ key: "a", label: "A", value: 10 }, { key: "b", label: "B", value: 4 }]}
          />
        );
      }
    `);
    expect(result.container.querySelector("svg")?.getAttribute("aria-label")).toBe("Sign-ups");
    result.unmount();
  });
});
