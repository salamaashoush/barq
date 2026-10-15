import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { Sidebar02 } from "./sidebar-02.tsx";
import { hydrateBlock } from "./test-harness.ts";

const sidebar = (): HTMLElement => document.querySelector('[data-slot="sidebar"]') as HTMLElement;

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("sidebar-02", () => {
  test("every section starts open, with the current page marked", () => {
    render(() => <Sidebar02 />);
    const triggers = [...document.querySelectorAll('[data-slot="sidebar-group-label"]')];
    expect(triggers.map((trigger) => trigger.textContent?.trim())).toEqual([
      "Getting Started",
      "Build Your Application",
      "API Reference",
      "Architecture",
      "Community",
    ]);
    for (const trigger of triggers) expect(trigger.getAttribute("aria-expanded")).toBe("true");

    const active = document.querySelector('[data-slot="sidebar-menu-button"][data-active="true"]');
    expect(active?.textContent).toBe("Data Fetching");
  });

  test("a section's label closes it and opens it again", async () => {
    render(() => <Sidebar02 />);
    const trigger = screen.getByRole("button", { name: "Community" });
    await user.click(trigger);
    flush();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(trigger);
    flush();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  test("the trigger collapses the sidebar", async () => {
    render(() => <Sidebar02 />);
    expect(sidebar().getAttribute("data-state")).toBe("expanded");
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    expect(sidebar().getAttribute("data-state")).toBe("collapsed");
  });

  test("the search field is labelled", () => {
    render(() => <Sidebar02 />);
    expect(screen.getByLabelText("Search").getAttribute("placeholder")).toBe("Search the docs...");
  });

  test("a section's label is its trigger, with no button wrapped inside it", async () => {
    render(() => <Sidebar02 />);
    expect(document.querySelector('[data-slot="collapsible-trigger"]')).toBeNull();
    const label = screen.getByRole("button", { name: "Community" });
    expect(label.getAttribute("data-slot")).toBe("sidebar-group-label");
    expect(label.getAttribute("tabindex")).toBe("0");
    expect(label.querySelector("button")).toBeNull();
    const root = label.closest('[data-slot="collapsible"]') as HTMLElement;
    const panel = root.querySelector('[data-slot="collapsible-content"]') as HTMLElement;
    expect(label.getAttribute("aria-controls")).toBe(panel.id);
    expect(root.getAttribute("data-state")).toBe("open");

    label.focus();
    await user.keyboard("{Enter}");
    flush();
    expect(root.getAttribute("data-state")).toBe("closed");
    expect(label.getAttribute("data-state")).toBe("closed");
  });

  test("the switcher is a sidebar row that opens the versions, ticking the current one", async () => {
    render(() => <Sidebar02 />);
    const switcher = screen.getByRole("button", { name: /Documentation/ });
    expect(switcher.getAttribute("data-slot")).toBe("sidebar-menu-button");
    expect(switcher.getAttribute("data-size")).toBe("lg");
    expect(switcher.getAttribute("aria-haspopup")).toBe("true");
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(switcher);
    await settle();
    expect(switcher.getAttribute("data-state")).toBe("open");
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent?.trim())).toEqual([
      "v1.0.1",
      "v1.1.0-alpha",
      "v2.0.0-beta1",
    ]);
    expect(items.map((item) => item.querySelector("svg") !== null)).toEqual([true, false, false]);
    expect(document.querySelector('[role="menu"] [role="separator"]')).toBeNull();

    await user.click(items[1] as HTMLElement);
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(switcher.textContent).toContain("v1.1.0-alpha");
    expect(switcher.getAttribute("data-state")).toBe("closed");
  });

  test("the search field is the sidebar's own input", () => {
    render(() => <Sidebar02 />);
    const field = screen.getByLabelText("Search");
    expect(field.getAttribute("data-slot")).toBe("sidebar-input");
    expect(field.getAttribute("data-sidebar")).toBe("input");
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("sidebar-02.tsx", "Sidebar02");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelectorAll('[data-slot="collapsible"]')).toHaveLength(5);
    result.unmount();
  });
});
