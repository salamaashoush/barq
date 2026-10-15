import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, expectNoAriaViolations, render, screen } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./pagination.tsx";

afterEach(cleanup);

function Pages() {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="?page=1" text="Back" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="?page=2" isActive>
            2
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="?page=3" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

describe("Pagination", () => {
  test("is a navigation landmark of links, the current page marked", () => {
    const { container } = render(() => <Pages />);
    expect(screen.getByRole("navigation", { name: "pagination" })).toBeTruthy();
    const current = screen.getByRole("link", { name: "2" });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.getAttribute("data-active")).toBe("");
    expectNoAriaViolations(container);
  });

  test("text is the word beside the chevron, and the link keeps its own name", () => {
    render(() => <Pages />);
    const previous = screen.getByRole("link", { name: "Go to previous page" });
    expect(previous.textContent).toContain("Back");
    expect(screen.getByRole("link", { name: "Go to next page" }).textContent).toContain("Next");
  });

  test("each chevron says which end of the link it is on", () => {
    render(() => <Pages />);
    const previous = screen.getByRole("link", { name: "Go to previous page" });
    const next = screen.getByRole("link", { name: "Go to next page" });
    expect(previous.querySelector("svg")?.getAttribute("data-icon")).toBe("inline-start");
    expect(previous.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    expect(next.querySelector("svg")?.getAttribute("data-icon")).toBe("inline-end");
    expect(next.lastElementChild?.tagName.toLowerCase()).toBe("svg");
  });

  test("right to left, the chevrons point the other way", () => {
    render(() => <Pages />);
    for (const name of ["Go to previous page", "Go to next page"]) {
      const icon = screen.getByRole("link", { name }).querySelector("svg") as SVGElement;
      const rules = rulesFor(icon.getAttribute("class") ?? "");
      expect(rules, name).toContain(":dir(rtl)");
      expect(rules, name).toContain("rotate: 180deg");
    }
  });

  test("a class on an edge link lands, whichever spelling", () => {
    render(() => (
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationNext href="?page=2" className="mine" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    ));
    expect(screen.getByRole("link").classList.contains("mine")).toBe(true);
  });
});
