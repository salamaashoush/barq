import { describe, expect, test } from "bun:test";
import { type Child, createSignal, flush } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, tick } from "@barqjs/testing";

import { hydrates, settle, wears } from "../test-arc.ts";
import { Gauge, gaugeStyles, gaugeTone } from "./gauge.tsx";

const LIMITS = [
  { value: 80, tone: "warning" as const },
  { value: 95, tone: "danger" as const },
];

async function drawn(): Promise<HTMLElement> {
  await tick();
  flush();
  return document.querySelector('[data-slot="gauge"]') as HTMLElement;
}

describe("Gauge", () => {
  test("is a meter named by its label, its reading written in words", async () => {
    render(() => <Gauge label="Storage" value={72} />);
    const gauge = await drawn();
    const found = screen.getByRole("meter", { name: "Storage" });
    expect(found).toBe(gauge);
    expect(gauge.getAttribute("aria-valuenow")).toBe("72");
    expect(gauge.getAttribute("aria-valuemin")).toBe("0");
    expect(gauge.getAttribute("aria-valuemax")).toBe("100");
    expect(gauge.getAttribute("aria-valuetext")).toBe("72");
    expect(document.querySelector('[data-slot="gauge-value"]')?.textContent).toBe("72");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("draws the reading's share of its arc in its tone, and the rest muted", async () => {
    render(() => <Gauge label="Storage" value={50} />);
    const gauge = await drawn();
    const fills = [...gauge.querySelectorAll("path")].map((path) => path.getAttribute("fill"));
    expect(fills).toContain("var(--info)");
    expect(fills).toContain("var(--muted)");
    const svg = gauge.querySelector("svg");
    expect(svg?.getAttribute("tabindex")).not.toBe("0");
  });

  test("changes tone at each threshold", async () => {
    const [value, setValue] = createSignal(72);
    render(() => <Gauge label="Storage" value={value()} thresholds={LIMITS} />);
    const gauge = await drawn();
    expect(gauge.getAttribute("data-tone")).toBe("info");
    setValue(85);
    await settle();
    expect(gauge.getAttribute("data-tone")).toBe("warning");
    expect(gauge.getAttribute("aria-valuenow")).toBe("85");
    setValue(99);
    await settle();
    expect(gauge.getAttribute("data-tone")).toBe("danger");
    expect([...gauge.querySelectorAll("path")].map((path) => path.getAttribute("fill"))).toContain(
      "var(--danger)",
    );
    expect(gaugeTone(10, LIMITS, "success")).toBe("success");
  });

  test("writes its reading in the locale and its unit, or in the caller's words", async () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <Gauge label="التخزين" value={42} formatOptions={{ style: "unit", unit: "percent" }} />
        <Gauge label="Seats" value={42} maxValue={50} valueLabel="42 of 50 seats" />
      </Arabic>
    ));
    await drawn();
    const [arabic, seats] = screen.getAllByRole("meter");
    expect(arabic?.getAttribute("aria-valuetext")).toContain("٤٢");
    expect(seats?.getAttribute("aria-valuetext")).toBe("42 of 50 seats");
  });

  test("takes a class per part, a slot on every part, and renders of its own", async () => {
    render(() => (
      <Gauge
        label="Storage"
        value={10}
        class="mine"
        classes={{ root: "r", plot: "p", centre: "c", value: "v", label: "l" }}
        renders={{ label: (part, words) => <h3 {...part.props}>{words}</h3> }}
      />
    ));
    const gauge = await drawn();
    const pairs: [string, string][] = [
      ["gauge", "r"],
      ["gauge-plot", "p"],
      ["gauge-centre", "c"],
      ["gauge-value", "v"],
      ["gauge-label", "l"],
    ];
    for (const [slot, name] of pairs) {
      expect(document.querySelector(`[data-slot="${slot}"]`)?.classList.contains(name)).toBe(true);
    }
    expect(gauge.classList.contains("mine")).toBe(true);
    expect(wears(gauge, gaugeStyles().root)).toBe(true);
    expect(document.querySelector('[data-slot="gauge-label"]')?.tagName).toBe("H3");
    expect(screen.getByRole("meter", { name: "Storage" })).toBe(gauge);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { Gauge } from "<arc>";
      export function Page() {
        return <Gauge label="Load" value={30} thresholds={[{ value: 20, tone: "warning" }]} />;
      }
    `);
    expect(result.container.querySelector('[role="meter progressbar"]')).not.toBeNull();
    expect(result.container.querySelector('[data-tone="warning"]')).not.toBeNull();
    result.unmount();
  });
});
