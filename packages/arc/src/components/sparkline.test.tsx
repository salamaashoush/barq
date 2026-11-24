import { describe, expect, test } from "bun:test";
import type { ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen } from "@barqjs/testing";

import { hydrates, wears } from "../test-arc.ts";
import { Sparkline, sparklineStyles } from "./sparkline.tsx";

describe("Sparkline", () => {
  test("a line is an image with its numbers in words", async () => {
    render(() => <Sparkline data={[90, 96, 101, 80, 128]} />);
    const image = screen.getByRole("img");
    expect(image.getAttribute("aria-label")).toBe(
      "Trend over 5 values, from 90 to 128; lowest 80, highest 128",
    );
    expect(image.querySelector('[data-slot="sparkline-line"]')?.getAttribute("d")).toBe(
      "M0.00,24.17L25.00,20.67L50.00,17.75L75.00,30.00L100.00,2.00",
    );
    expect(image.querySelector('[data-slot="sparkline-area"]')).toBeNull();
    expect(image.getAttribute("data-variant")).toBe("line");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("an area fills under its line", () => {
    render(() => <Sparkline data={[1, 3, 2]} variant="area" />);
    const area = document.querySelector('[data-slot="sparkline-area"]');
    expect(area?.getAttribute("d")).toEndWith("L100,32L0,32Z");
    expect(document.querySelector('[data-slot="sparkline-line"]')).not.toBeNull();
  });

  test("bars stand on zero, and a shared domain keeps two on one scale", () => {
    render(() => (
      <>
        <Sparkline data={[0, 5, 10]} variant="bar" />
        <Sparkline data={[5]} variant="bar" domain={[0, 10]} />
      </>
    ));
    const [first, second] = screen.getAllByRole("img");
    const heights = [...(first?.querySelectorAll("rect") ?? [])].map((bar) =>
      Number(bar.getAttribute("height")),
    );
    expect(heights[0]).toBeLessThan(heights[1] ?? 0);
    expect(heights[1]).toBeLessThan(heights[2] ?? 0);
    const half = Number(second?.querySelector("rect")?.getAttribute("height"));
    expect(half).toBeCloseTo((heights[2] ?? 0) / 2, 0);
  });

  test("writes its numbers in the reader's locale, right to left", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <Sparkline data={[1, 2]} />
      </Arabic>
    ));
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("٢");
  });

  test("takes a label, a tone, a class per part and a slot on every part", () => {
    render(() => (
      <Sparkline
        data={[1, 2, 3]}
        variant="area"
        tone="danger"
        label="Errors this week"
        class="mine"
        classes={{ root: "r", area: "a", line: "l" }}
      />
    ));
    const image = screen.getByRole("img", { name: "Errors this week" });
    expect(image.getAttribute("data-slot")).toBe("sparkline");
    expect(image.classList.contains("mine")).toBe(true);
    expect(image.classList.contains("r")).toBe(true);
    expect(wears(image, sparklineStyles({ tone: "danger" }).root)).toBe(true);
    expect(document.querySelector('[data-slot="sparkline-area"]')?.classList.contains("a")).toBe(
      true,
    );
    expect(document.querySelector('[data-slot="sparkline-line"]')?.classList.contains("l")).toBe(
      true,
    );
  });

  test("a bar per value takes its own class", () => {
    render(() => <Sparkline data={[1, 2]} variant="bar" classes={{ bar: "b" }} />);
    const bars = document.querySelectorAll('[data-slot="sparkline-bar"]');
    expect(bars.length).toBe(2);
    expect(bars[0]?.classList.contains("b")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { Sparkline } from "<arc>";
      export function Page() {
        return (
          <div>
            <Sparkline data={[1, 4, 2]} variant="area" />
            <Sparkline data={[1, 4, 2]} variant="bar" />
          </div>
        );
      }
    `);
    expect(result.container.querySelectorAll('[role="img"]').length).toBe(2);
    result.unmount();
  });
});
