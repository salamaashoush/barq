import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { render, screen, user } from "@barqjs/testing";

import { Sidebar04 } from "./sidebar-04.tsx";
import { hydrateBlock } from "./test-harness.ts";

const sidebar = (): HTMLElement => document.querySelector('[data-slot="sidebar"]') as HTMLElement;

describe("sidebar-04", () => {
  test("the sidebar floats, and has no rail", () => {
    render(() => <Sidebar04 />);
    expect(sidebar().getAttribute("data-variant")).toBe("floating");
    expect(document.querySelector('[data-slot="sidebar-rail"]')).toBeNull();
  });

  test("the wider sidebar is the provider's own width, set on the wrapper", () => {
    render(() => <Sidebar04 />);
    const wrapper = document.querySelector('[data-slot="sidebar-wrapper"]') as HTMLElement;
    expect(wrapper.style.getPropertyValue("--sidebar-width")).toBe("19rem");
    expect(wrapper.style.getPropertyValue("--sidebar-width-icon")).toBe("3rem");
    expect(collectCss()).not.toContain("--sidebar-width: 19rem");
  });

  test("each section is a link with its pages in a submenu under it", () => {
    render(() => <Sidebar04 />);
    expect(screen.getByRole("link", { name: "Community" })).not.toBeNull();
    expect(document.querySelectorAll('[data-slot="sidebar-menu-sub"]')).toHaveLength(5);
    const active = document.querySelector(
      '[data-slot="sidebar-menu-sub-button"][data-active="true"]',
    );
    expect(active?.textContent).toBe("Data Fetching");
  });

  test("the trigger collapses the sidebar", async () => {
    render(() => <Sidebar04 />);
    expect(sidebar().getAttribute("data-state")).toBe("expanded");
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    expect(sidebar().getAttribute("data-state")).toBe("collapsed");
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("sidebar-04.tsx", "Sidebar04");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(
      result.container.querySelector('[data-slot="sidebar"]')?.getAttribute("data-variant"),
    ).toBe("floating");
    const wrapper = result.container.querySelector('[data-slot="sidebar-wrapper"]') as HTMLElement;
    expect(wrapper.style.getPropertyValue("--sidebar-width")).toBe("19rem");
    result.unmount();
  });
});
