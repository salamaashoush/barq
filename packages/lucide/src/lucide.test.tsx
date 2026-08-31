import { describe, expect, test } from "bun:test";
import { render } from "@barqjs/testing";

import { Check } from "./icons/check.tsx";
import { CircleCheck } from "./icons/circle-check.tsx";
import { ICON_ALIASES, ICON_NAMES, LUCIDE_VERSION } from "./manifest.ts";

function svgOf(node: () => unknown): SVGSVGElement {
  const { container } = render(node as never);
  const svg = container.querySelector("svg");
  if (svg === null) throw new Error("no <svg> was rendered");
  return svg;
}

describe("an icon", () => {
  test("draws lucide's own paths", () => {
    const svg = svgOf(() => <Check />);
    expect(svg.querySelector("path")?.getAttribute("d")).toBe("M20 6 9 17l-5-5");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
  });

  test("keeps every node of a multi-part icon, in order", () => {
    const svg = svgOf(() => <CircleCheck />);
    expect([...svg.children].map((child) => child.tagName.toLowerCase())).toEqual([
      "circle",
      "path",
    ]);
  });

  test("is 24 by 24 with a 2px stroke unless asked otherwise", () => {
    const svg = svgOf(() => <Check />);
    expect(svg.getAttribute("width")).toBe("24");
    expect(svg.getAttribute("height")).toBe("24");
    expect(svg.getAttribute("stroke-width")).toBe("2");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
  });

  test("size sets both dimensions", () => {
    const svg = svgOf(() => <Check size={16} />);
    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.getAttribute("height")).toBe("16");
  });

  test("colour and stroke width are props", () => {
    const svg = svgOf(() => <Check color="red" strokeWidth={1.5} />);
    expect(svg.getAttribute("stroke")).toBe("red");
    expect(svg.getAttribute("stroke-width")).toBe("1.5");
  });

  test("absoluteStrokeWidth holds the stroke as the icon shrinks", () => {
    const svg = svgOf(() => <Check size={12} strokeWidth={2} absoluteStrokeWidth />);
    expect(svg.getAttribute("stroke-width")).toBe("4");
  });

  test("absoluteStrokeWidth is a no-op at the natural size", () => {
    const svg = svgOf(() => <Check size={24} absoluteStrokeWidth />);
    expect(svg.getAttribute("stroke-width")).toBe("2");
  });

  test("is hidden from assistive technology by default", () => {
    expect(svgOf(() => <Check />).getAttribute("aria-hidden")).toBe("true");
  });

  test("naming it makes it content", () => {
    const svg = svgOf(() => <Check aria-label="Done" />);
    expect(svg.getAttribute("aria-label")).toBe("Done");
    expect(svg.getAttribute("aria-hidden")).toBeNull();
  });

  test("class and style pass through", () => {
    const svg = svgOf(() => <Check class="mine" style={{ color: "blue" }} />);
    expect(svg.getAttribute("class")).toBe("mine");
    expect(svg.getAttribute("style")).toContain("color: blue");
  });
});

describe("the set", () => {
  test("is the whole of lucide", () => {
    expect(ICON_NAMES.length).toBeGreaterThan(1700);
    expect(ICON_NAMES).toContain("check");
    expect(LUCIDE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("a renamed icon is still reachable under its old name", async () => {
    const barrel = (await import("./index.ts")) as Record<string, unknown>;
    expect(ICON_ALIASES["more-horizontal"]).toBe("ellipsis");
    expect(barrel["MoreHorizontal"]).toBe(barrel["Ellipsis"]);
  });

  test("every name in the manifest has a module and exports its component", async () => {
    // A sample rather than all 1,790: the generator writes them from one
    // template, so a name that resolves proves the naming rule for the rest.
    const sample = ["check", "chevron-down", "a-arrow-down", "arrow-up-1-0", "circle-check"];
    for (const name of sample) {
      const module_ = (await import(`./icons/${name}.tsx`)) as Record<string, unknown>;
      const exported = Object.keys(module_);
      expect(exported).toHaveLength(1);
      expect(typeof module_[exported[0] ?? ""]).toBe("function");
    }
  });

  test("the barrel exports one component per icon plus the aliases", async () => {
    const barrel = (await import("./index.ts")) as Record<string, unknown>;
    const components = Object.entries(barrel)
      .filter(([name, value]) => /^[A-Z]/.test(name) && typeof value === "function")
      .map(([name]) => name);
    expect(components).toHaveLength(ICON_NAMES.length + Object.keys(ICON_ALIASES).length);
  });
});
