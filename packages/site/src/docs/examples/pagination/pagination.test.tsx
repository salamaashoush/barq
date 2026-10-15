import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import PaginationDemo from "./pagination-demo.tsx";
import PaginationIconsOnly from "./pagination-icons-only.tsx";
import PaginationRtl from "./pagination-rtl.tsx";

describe("the pagination examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("pagination")).toEqual([]);
  });

  test("the pages are links in a navigation, and the current one says so", () => {
    render(() => <PaginationDemo />);
    const nav = screen.getByRole("navigation");
    const links = [...nav.querySelectorAll("a")];
    expect(links).toHaveLength(5);
    expect(links.filter((link) => link.getAttribute("aria-current") === "page")).toHaveLength(1);
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe("2");
  });

  test("the rows field is labelled and starts at twenty-five", () => {
    render(() => <PaginationIconsOnly />);
    expect(document.querySelector('[data-slot="select-trigger"]')?.textContent).toContain("25");
    expect(screen.getByRole("navigation").querySelectorAll("a")).toHaveLength(2);
  });

  test("the right-to-left pagination names its direction and its arrows", () => {
    render(() => <PaginationRtl />);
    const nav = screen.getByRole("navigation");
    expect(nav.closest('[dir="rtl"]')).not.toBeNull();
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe("٢");
    expect(nav.textContent).toContain("السابق");
    expect(nav.textContent).toContain("التالي");
  });
});
