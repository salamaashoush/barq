import { describe, expect, test } from "bun:test";
import { ariaViolations, render, screen } from "@barqjs/testing";
import { ChartBars, ChartContainer } from "@barqjs/ui/chart";
import { srOnly } from "@barqjs/ui/sr-only";

import { hydrates } from "../test-arc.ts";
import { ChartDataTable, seriesConfig, toneColour } from "./chart-frame.tsx";

const DATA = {
  columns: [{ label: "Month" }, { label: "Desktop", numeric: true }],
  rows: [
    ["Jan", "186"],
    ["Feb", "305"],
  ],
};

describe("ChartDataTable", () => {
  test("is a captioned table with a header per column and per row", async () => {
    render(() => <ChartDataTable label="Visitors" data={DATA} />);
    const table = screen.getByRole("table", { name: "Visitors" });
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Month",
      "Desktop",
    ]);
    expect(screen.getAllByRole("rowheader").map((th) => th.textContent)).toEqual(["Jan", "Feb"]);
    expect(table.querySelector("[data-numeric]")?.textContent).toBe("Desktop");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("beside one of ui's charts it is that drawing's numbers, hidden from sight", () => {
    render(() => (
      <ChartContainer config={seriesConfig([{ key: "desktop", label: "Desktop", tone: "info" }])}>
        <ChartBars data={[{ month: "Jan", desktop: 186 }]} x="month" aria-label="Visitors" />
        <ChartDataTable label="Visitors" data={DATA} hidden />
      </ChartContainer>
    ));
    const table = screen.getByRole("table", { name: "Visitors" });
    expect(table.classList.contains(srOnly)).toBe(true);
    const chart = document.querySelector('[data-slot="chart"]') as HTMLElement;
    expect(chart.style.getPropertyValue("--color-desktop")).toBe("var(--info)");
  });

  test("a tone is the theme's, and no tone walks the chart ramp", () => {
    expect(toneColour("danger")).toBe("var(--danger)");
    expect(toneColour(undefined, 6)).toBe("var(--chart-2)");
  });

  test("takes a class per part and a slot on every part", () => {
    render(() => (
      <ChartDataTable
        label="Visitors"
        data={DATA}
        class="mine"
        classes={{ table: "t", caption: "c", header: "h", cell: "x" }}
      />
    ));
    const table = screen.getByRole("table");
    expect(table.classList.contains("mine")).toBe(true);
    expect(table.getAttribute("data-slot")).toBe("chart-table");
    for (const [slot, name] of [
      ["chart-table", "t"],
      ["chart-table-caption", "c"],
      ["chart-table-header", "h"],
      ["chart-table-cell", "x"],
    ] as const) {
      expect(document.querySelector(`[data-slot="${slot}"]`)?.classList.contains(name)).toBe(true);
    }
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { ChartDataTable } from "<arc>";
      export function Page() {
        return (
          <ChartDataTable
            label="Visitors"
            data={{ columns: [{ label: "Month" }, { label: "Desktop" }], rows: [["Jan", "1"]] }}
          />
        );
      }
    `);
    expect(result.container.querySelector("caption")?.textContent).toBe("Visitors");
    result.unmount();
  });
});
