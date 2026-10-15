import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import SeparatorDemo from "./separator-demo.tsx";
import SeparatorList from "./separator-list.tsx";
import SeparatorMenu from "./separator-menu.tsx";
import SeparatorRtl from "./separator-rtl.tsx";
import SeparatorVertical from "./separator-vertical.tsx";

const orientations = (): (string | null)[] =>
  screen.getAllByRole("separator").map((rule) => rule.getAttribute("data-orientation"));

describe("the separator examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("separator")).toEqual([]);
  });

  test("a separator is horizontal unless told otherwise", () => {
    render(() => <SeparatorDemo />);
    expect(orientations()).toEqual(["horizontal"]);
    expect(screen.getByRole("separator").getAttribute("data-slot")).toBe("separator");
  });

  test("a vertical separator announces its orientation", () => {
    render(() => <SeparatorVertical />);
    expect(orientations()).toEqual(["vertical", "vertical"]);
    for (const rule of screen.getAllByRole("separator")) {
      expect(rule.getAttribute("aria-orientation")).toBe("vertical");
    }
  });

  test("the menu puts a vertical rule between each pair of entries", () => {
    render(() => <SeparatorMenu />);
    expect(orientations()).toEqual(["vertical", "vertical"]);
    for (const rule of screen.getAllByRole("separator")) {
      expect(rule.previousElementSibling?.tagName).toBe("DIV");
      expect(rule.nextElementSibling?.tagName).toBe("DIV");
    }
  });

  test("the list puts a rule between each pair of rows", () => {
    render(() => <SeparatorList />);
    expect(orientations()).toEqual(["horizontal", "horizontal"]);
    expect(document.querySelectorAll("dl")).toHaveLength(3);
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <SeparatorRtl />);
    expect(document.querySelector('[dir="rtl"] [data-slot="separator"]')).not.toBeNull();
  });
});
