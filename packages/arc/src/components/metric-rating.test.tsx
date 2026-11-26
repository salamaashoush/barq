import { describe, expect, test } from "bun:test";
import { ariaViolations, render } from "@barqjs/testing";

import { hydrates } from "../test-arc.ts";
import { MetricRating, rateMetric } from "./metric-rating.tsx";

describe("MetricRating", () => {
  test("rates lower-is-better and higher-is-better bounds", () => {
    const loads = { good: 2500, poor: 4000 };
    expect(rateMetric(1800, loads)).toBe("good");
    expect(rateMetric(2500, loads)).toBe("good");
    expect(rateMetric(3000, loads)).toBe("fair");
    expect(rateMetric(4200, loads)).toBe("poor");
    const scores = { good: 90, poor: 50 };
    expect(rateMetric(95, scores)).toBe("good");
    expect(rateMetric(70, scores)).toBe("fair");
    expect(rateMetric(20, scores)).toBe("poor");
    expect(rateMetric(null, scores)).toBeUndefined();
    expect(rateMetric(Number.NaN, scores)).toBeUndefined();
  });

  test("says the rating in words and a tone, or in the caller's words", async () => {
    render(() => (
      <>
        <MetricRating rating="fair" />
        <MetricRating rating="good" variant="subtle">
          Fast
        </MetricRating>
      </>
    ));
    const [fair, fast] = [...document.querySelectorAll("[data-rating]")];
    expect(fair?.textContent).toBe("Needs improvement");
    expect(fair?.getAttribute("data-tone")).toBe("warning");
    expect(fast?.textContent).toBe("Fast");
    expect(fast?.getAttribute("data-tone")).toBe("success");
    expect(fast?.getAttribute("data-variant")).toBe("subtle");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { MetricRating } from "<arc>";
      export function Page() {
        return <MetricRating rating="poor" />;
      }
    `);
    expect(result.container.querySelector('[data-rating="poor"]')?.textContent).toBe("Poor");
    result.unmount();
  });
});
