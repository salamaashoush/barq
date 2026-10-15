import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./breadcrumb.tsx";

afterEach(cleanup);

function Trail() {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/">Home</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbEllipsis />
        </BreadcrumbItem>
        <BreadcrumbSeparator>/</BreadcrumbSeparator>
        <BreadcrumbItem>
          <BreadcrumbPage>Invoices</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

describe("Breadcrumb", () => {
  test("is a named navigation landmark whose last crumb is the current page", () => {
    const { container } = render(() => <Trail />);
    expect(screen.getByRole("navigation", { name: "breadcrumb" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/");
    const page = document.querySelector('[data-slot="breadcrumb-page"]') as HTMLElement;
    expect(page.getAttribute("aria-current")).toBe("page");
    expect(page.getAttribute("aria-disabled")).toBe("true");
    expectNoAriaViolations(container);
  });

  test("the separators are drawn and not announced, and a caller's replaces the chevron", () => {
    render(() => <Trail />);
    const separators = [...document.querySelectorAll('[data-slot="breadcrumb-separator"]')];
    expect(separators).toHaveLength(2);
    expect(separators[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(separators[0]?.querySelector("svg")).not.toBeNull();
    expect(separators[1]?.textContent).toBe("/");
    expect(separators[1]?.querySelector("svg")).toBeNull();
  });

  test("right to left, the chevron between crumbs points the other way", () => {
    render(() => <Trail />);
    const separator = document.querySelector('[data-slot="breadcrumb-separator"]') as HTMLElement;
    const rules = rulesFor(separator.className);
    expect(rules).toContain(":dir(rtl)");
    expect(rules).toContain("rotate: 180deg");
  });
});

describe("BreadcrumbLink, as another element", () => {
  test("render puts the caller's element in the link's place, slot, class and all", async () => {
    let pressed = 0;
    let element = null as Element | null;
    render(() => (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Plain</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbLink
              class="mine"
              data-caller="yes"
              ref={(node) => {
                element = node;
              }}
              render={(link) => (
                <button {...link.props} ref={link.ref} type="button" onClick={() => pressed++}>
                  Home
                </button>
              )}
            />
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    ));

    const plain = screen.getByRole("link", { name: "Plain" });
    const home = screen.getByRole("button", { name: "Home" });
    expect(home.getAttribute("data-slot")).toBe("breadcrumb-link");
    expect(home.getAttribute("data-caller")).toBe("yes");
    expect(home.classList.contains("mine")).toBe(true);
    for (const name of plain.classList) expect(home.classList.contains(name)).toBe(true);
    expect(element).toBe(home);
    expect(document.querySelectorAll("a")).toHaveLength(1);

    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(home);
    await user.click(home);
    expect(pressed).toBe(1);
  });
});
