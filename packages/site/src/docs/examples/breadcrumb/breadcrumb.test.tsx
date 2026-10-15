import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import BreadcrumbBasic from "./breadcrumb-basic.tsx";
import BreadcrumbDemo from "./breadcrumb-demo.tsx";
import BreadcrumbDropdown from "./breadcrumb-dropdown.tsx";
import BreadcrumbEllipsisDemo from "./breadcrumb-ellipsis.tsx";
import BreadcrumbRtl from "./breadcrumb-rtl.tsx";
import BreadcrumbSeparatorDemo from "./breadcrumb-separator.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const items = (): readonly (string | null)[] =>
  screen.getAllByRole("menuitem").map((item) => item.textContent);

async function close(trigger: Element): Promise<void> {
  await user.keyboard("{Escape}");
  await settle();
  expect(screen.queryByRole("menu")).toBeNull();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
}

describe("the breadcrumb examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("breadcrumb")).toEqual([]);
  });

  test("the trail is a named navigation whose last crumb is the current page", () => {
    render(() => <BreadcrumbBasic />);
    const trail = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(
      [...trail.querySelectorAll('[data-slot="breadcrumb-link"]')].map((link) => link.textContent),
    ).toEqual(["Home", "Components"]);
    const page = trail.querySelector('[data-slot="breadcrumb-page"]');
    expect(page?.textContent).toBe("Breadcrumb");
    expect(page?.getAttribute("aria-current")).toBe("page");
    expect(trail.querySelectorAll('[data-slot="breadcrumb-separator"]')).toHaveLength(2);
  });

  test("the ellipsis button opens a menu of the hidden crumbs", async () => {
    render(() => <BreadcrumbDemo />);
    const trigger = screen.getByRole("button", { name: "Toggle menu" });
    expect(trigger.querySelector('[data-slot="breadcrumb-ellipsis"]')).not.toBeNull();

    await user.click(trigger);
    await settle();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(items()).toEqual(["Documentation", "Themes", "GitHub"]);

    await close(trigger);
  });

  test("a custom separator replaces the chevron", () => {
    render(() => <BreadcrumbSeparatorDemo />);
    const separators = [...document.querySelectorAll('[data-slot="breadcrumb-separator"]')];
    expect(separators).toHaveLength(2);
    for (const separator of separators) {
      expect(separator.getAttribute("aria-hidden")).toBe("true");
      expect(separator.querySelectorAll("svg")).toHaveLength(1);
      expect(separator.querySelector("circle")).not.toBeNull();
    }
  });

  test("a plain button in the trail is the menu's trigger", async () => {
    render(() => <BreadcrumbDropdown />);
    const trigger = screen.getByRole("button", { name: "Components" });
    expect(trigger.getAttribute("data-slot")).toBe("dropdown-menu-trigger");
    expect(trigger.getAttribute("aria-haspopup")).toBe("true");

    await user.click(trigger);
    await settle();
    expect(items()).toEqual(["Documentation", "Themes", "GitHub"]);

    await close(trigger);
  });

  test("a collapsed trail shows an ellipsis that is hidden from assistive technology", () => {
    render(() => <BreadcrumbEllipsisDemo />);
    const ellipsis = document.querySelector('[data-slot="breadcrumb-ellipsis"]');
    expect(ellipsis?.getAttribute("aria-hidden")).toBe("true");
    expect(ellipsis?.closest('[data-slot="breadcrumb-item"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-slot="breadcrumb-separator"]')).toHaveLength(3);
  });

  test("the right-to-left example names its direction and opens its menu", async () => {
    render(() => <BreadcrumbRtl />);
    expect(document.querySelector('[dir="rtl"] [data-slot="breadcrumb"]')).not.toBeNull();
    const trigger = screen.getByRole("button", { name: "المكونات" });

    await user.click(trigger);
    await settle();
    expect(items()).toEqual(["التوثيق", "السمات", "جيت هاب"]);

    await close(trigger);
  });
});
