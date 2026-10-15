import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { Sidebar14 } from "./sidebar-14.tsx";
import { hydrateBlock } from "./test-harness.ts";

const sidebar = (): HTMLElement => document.querySelector('[data-slot="sidebar"]') as HTMLElement;

describe("sidebar-14", () => {
  test("the table of contents is on the right, after the page it describes", () => {
    render(() => <Sidebar14 />);
    expect(screen.getByText("Table of Contents")).not.toBeNull();
    expect(sidebar().getAttribute("data-side")).toBe("right");

    const inset = document.querySelector('[data-slot="sidebar-inset"]') as HTMLElement;
    expect(inset.compareDocumentPosition(sidebar()) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  test("every section links its pages, and the current one is marked", () => {
    render(() => <Sidebar14 />);
    expect(document.querySelectorAll('[data-slot="sidebar-menu-button"]')).toHaveLength(5);
    expect(document.querySelectorAll('[data-slot="sidebar-menu-sub-button"]')).toHaveLength(26);

    const active = document.querySelectorAll(
      '[data-slot="sidebar-menu-sub-button"][data-active="true"]',
    );
    expect(active).toHaveLength(1);
    expect(active[0]?.textContent).toBe("Data Fetching");
    expect(active[0]?.getAttribute("href")).toBe("#");
  });

  test("the trigger collapses it", async () => {
    render(() => <Sidebar14 />);
    expect(sidebar().getAttribute("data-state")).toBe("expanded");
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    expect(sidebar().getAttribute("data-state")).toBe("collapsed");
    expect(sidebar().getAttribute("data-collapsible")).toBe("offcanvas");
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("sidebar-14.tsx", "Sidebar14");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelector('[data-slot="sidebar"]')?.getAttribute("data-side")).toBe(
      "right",
    );
    result.unmount();
  });
});
