import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import SidebarControlled from "./sidebar-controlled.tsx";
import SidebarDemo from "./sidebar-demo.tsx";
import SidebarMenuBadgeDemo from "./sidebar-menu-badge.tsx";
import SidebarMenuCollapsible from "./sidebar-menu-collapsible.tsx";
import SidebarRtl from "./sidebar-rtl.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const state = (): string | null | undefined =>
  document.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state");

describe("the sidebar examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("sidebar")).toEqual([]);
  });

  test("the demo opens its first group and the trigger collapses it to icons", async () => {
    render(() => <SidebarDemo />);
    const playground = screen.getByRole("button", { name: "Playground" });
    expect(playground.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "History" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Models" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(playground.closest('[data-slot="sidebar-menu-item"]')?.getAttribute("data-state")).toBe(
      "open",
    );

    expect(state()).toBe("expanded");
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    await settle();
    expect(state()).toBe("collapsed");
  });

  test("the team switcher changes the team", async () => {
    render(() => <SidebarDemo />);
    await user.click(screen.getByRole("button", { name: /Acme Inc/ }));
    await settle();
    await user.click(screen.getByRole("menuitem", { name: /Evil Corp\./ }));
    await settle();
    expect(screen.getByRole("button", { name: /Evil Corp\./ })).toBeTruthy();
  });

  test("a collapsible item is the menu item and opens its pages", async () => {
    render(() => <SidebarMenuCollapsible />);
    const items = document.querySelectorAll('[data-slot="sidebar-menu-item"]');
    expect(items[0]?.getAttribute("data-state")).toBe("open");
    const build = screen.getByRole("button", { name: "Build Your Application" });
    expect(build.getAttribute("aria-expanded")).toBe("false");
    await user.click(build);
    await settle();
    expect(build.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Data Fetching" })).toBeTruthy();
  });

  test("each project carries its badge", () => {
    render(() => <SidebarMenuBadgeDemo />);
    expect(
      [...document.querySelectorAll('[data-slot="sidebar-menu-badge"]')].map(
        (badge) => badge.textContent,
      ),
    ).toEqual(["24", "12", "3", "21", "8"]);
  });

  test("the controlled sidebar follows its button", async () => {
    render(() => <SidebarControlled />);
    expect(state()).toBe("expanded");
    await user.click(screen.getByRole("button", { name: "Close Sidebar" }));
    await settle();
    expect(state()).toBe("collapsed");
    expect(screen.getByRole("button", { name: "Open Sidebar" })).toBeTruthy();
  });

  test("the right-to-left sidebar sits on the right", () => {
    render(() => <SidebarRtl />);
    const sidebar = document.querySelector('[dir="rtl"] [data-slot="sidebar"]');
    expect(sidebar?.getAttribute("data-side")).toBe("right");
    expect(screen.getByRole("button", { name: "ملعب" })).toBeTruthy();
  });
});
