import { describe, expect, test } from "bun:test";
import { collectCss } from "@barqjs/css";
import { render, screen } from "@barqjs/testing";

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./breadcrumb.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty.tsx";
import { NativeSelect } from "./native-select.tsx";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./pagination.tsx";
import { ScrollArea } from "./scroll-area.tsx";

function rulesFor(className: string): string {
  const mentions = new RegExp(`\\.${className}(?![\\w-])`);
  return collectCss()
    .split("@layer barq.ui{")
    .filter((chunk) => mentions.test(chunk))
    .join("\n");
}

describe("Breadcrumb", () => {
  test("is a named landmark whose last crumb is the current page", () => {
    render(() => (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbEllipsis />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Invoices</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    ));

    expect(screen.getByRole("navigation", { name: "breadcrumb" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/");
    const page = screen.getByText("Invoices");
    expect(page.getAttribute("aria-current")).toBe("page");
    expect(page.getAttribute("aria-disabled")).toBe("true");
  });

  test("a separator is hidden from assistive technology and draws a chevron", () => {
    render(() => (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbSeparator />
        </BreadcrumbList>
      </Breadcrumb>
    ));
    const separator = document.querySelector('[data-slot="breadcrumb-separator"]')!;
    expect(separator.getAttribute("aria-hidden")).toBe("true");
    expect(separator.querySelector("svg")).not.toBeNull();
  });

  test("a caller's own separator replaces the chevron", () => {
    render(() => (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbSeparator>/</BreadcrumbSeparator>
        </BreadcrumbList>
      </Breadcrumb>
    ));
    const separator = document.querySelector('[data-slot="breadcrumb-separator"]')!;
    expect(separator.textContent).toBe("/");
    expect(separator.querySelector("svg")).toBeNull();
  });
});

describe("Pagination", () => {
  test("the pages are links and the current one says so", () => {
    render(() => (
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="?page=1" />
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
    ));

    expect(screen.getByRole("navigation", { name: "pagination" })).toBeTruthy();
    const current = screen.getByRole("link", { name: "2" });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.getAttribute("data-active")).toBe("");
    expect(screen.getByRole("link", { name: "Go to previous page" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to next page" })).toBeTruthy();
  });

  test("the active page uses the outline variant and the rest are ghosts", () => {
    render(() => (
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#" isActive>
              1
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#">2</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    ));
    const [active, other] = screen.getAllByRole("link");
    expect(active!.className).not.toBe(other!.className);
  });
});

describe("Empty", () => {
  test("every part is addressable and the icon variant is marked", () => {
    render(() => (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">icon</EmptyMedia>
          <EmptyTitle>No invoices yet</EmptyTitle>
          <EmptyDescription>They appear here once you send one.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>content</EmptyContent>
      </Empty>
    ));
    expect(document.querySelector('[data-slot="empty-media"]')?.getAttribute("data-variant")).toBe(
      "icon",
    );
    expect(screen.getByText("No invoices yet").getAttribute("data-slot")).toBe("empty-title");
  });
});

describe("NativeSelect", () => {
  test("is a real select, and the chevron is a background image", () => {
    render(() => (
      <NativeSelect aria-label="Fruit" name="fruit">
        <option value="apple">Apple</option>
      </NativeSelect>
    ));
    const control = screen.getByRole("combobox") as HTMLSelectElement;
    expect(control.tagName.toLowerCase()).toBe("select");
    expect(control.name).toBe("fruit");
    expect(control.className.split(" ").map(rulesFor).join("")).toContain("background-image");
  });
});

describe("ScrollArea", () => {
  test("is a focusable region with a themed scrollbar", () => {
    render(() => <ScrollArea aria-label="Log">lots of text</ScrollArea>);
    const region = screen.getByRole("region", { name: "Log" });
    expect(region.getAttribute("tabindex")).toBe("0");
    const rules = rulesFor(region.className.split(" ")[0] ?? "");
    expect(rules).toContain("overflow: auto");
    expect(rules).toContain("scrollbar-color: var(--border) transparent");
  });
});
