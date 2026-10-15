import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { Sidebar03 } from "./sidebar-03.tsx";
import { hydrateBlock } from "./test-harness.ts";

const sidebar = (): HTMLElement => document.querySelector('[data-slot="sidebar"]') as HTMLElement;

describe("sidebar-03", () => {
  test("each section is a link with its pages in a submenu under it", () => {
    render(() => <Sidebar03 />);
    const sections = [...document.querySelectorAll('[data-slot="sidebar-menu-item"]')].slice(1);
    expect(sections).toHaveLength(5);

    const build = sections[1] as HTMLElement;
    expect(build.querySelector('[data-slot="sidebar-menu-button"]')?.textContent).toBe(
      "Build Your Application",
    );
    expect(build.querySelectorAll('[data-slot="sidebar-menu-sub-button"]')).toHaveLength(12);

    const active = document.querySelector(
      '[data-slot="sidebar-menu-sub-button"][data-active="true"]',
    );
    expect(active?.textContent).toBe("Data Fetching");
    expect(active?.getAttribute("href")).toBe("#");
  });

  test("the brand row is a link naming the product and its version", () => {
    render(() => <Sidebar03 />);
    const brand = screen.getByRole("link", { name: /Documentation/ });
    expect(brand.textContent).toContain("v1.0.0");
    expect(brand.getAttribute("data-size")).toBe("lg");
  });

  test("the trigger collapses the sidebar", async () => {
    render(() => <Sidebar03 />);
    expect(sidebar().getAttribute("data-state")).toBe("expanded");
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    expect(sidebar().getAttribute("data-state")).toBe("collapsed");
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("sidebar-03.tsx", "Sidebar03");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelectorAll('[data-slot="sidebar-menu-sub"]')).toHaveLength(5);
    result.unmount();
  });
});
