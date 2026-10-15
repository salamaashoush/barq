import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { Sidebar01 } from "./sidebar-01.tsx";
import { hydrateBlock } from "./test-harness.ts";

const sidebar = (): HTMLElement => document.querySelector('[data-slot="sidebar"]') as HTMLElement;

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("sidebar-01", () => {
  test("the navigation is grouped by section, with the current page marked", () => {
    render(() => <Sidebar01 />);
    const labels = [...document.querySelectorAll('[data-slot="sidebar-group-label"]')];
    expect(labels.map((label) => label.textContent)).toEqual([
      "Getting Started",
      "Build Your Application",
      "API Reference",
      "Architecture",
    ]);

    const active = document.querySelector('[data-slot="sidebar-menu-button"][data-active="true"]');
    expect(active?.textContent).toBe("Data Fetching");
    expect(active?.tagName).toBe("A");
  });

  test("the trigger collapses the sidebar", async () => {
    render(() => <Sidebar01 />);
    expect(sidebar().getAttribute("data-state")).toBe("expanded");
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    expect(sidebar().getAttribute("data-state")).toBe("collapsed");
  });

  test("the search field is labelled", () => {
    render(() => <Sidebar01 />);
    expect(screen.getByLabelText("Search").getAttribute("placeholder")).toBe("Search the docs...");
  });

  test("choosing a version shows it on the switcher", async () => {
    render(() => <Sidebar01 />);
    const switcher = screen.getByRole("button", { name: /Documentation/ });
    expect(switcher.textContent).toContain("v1.0.1");

    await user.click(switcher);
    flush();
    await user.click(screen.getByRole("menuitem", { name: /v1\.1\.0-alpha/ }));
    flush();
    expect(switcher.textContent).toContain("v1.1.0-alpha");
  });

  test("the switcher is a sidebar row that opens the versions, ticking the current one", async () => {
    render(() => <Sidebar01 />);
    const switcher = screen.getByRole("button", { name: /Documentation/ });
    expect(switcher.getAttribute("data-slot")).toBe("sidebar-menu-button");
    expect(switcher.getAttribute("data-size")).toBe("lg");
    expect(switcher.getAttribute("aria-haspopup")).toBe("true");
    expect(switcher.getAttribute("data-state")).toBe("closed");
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

    await user.click(items[2] as HTMLElement);
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(switcher.getAttribute("data-state")).toBe("closed");

    await user.click(switcher);
    await settle();
    expect(
      screen.getAllByRole("menuitem").map((item) => item.querySelector("svg") !== null),
    ).toEqual([false, false, true]);
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("the search field is the sidebar's own input", () => {
    render(() => <Sidebar01 />);
    const field = screen.getByLabelText("Search");
    expect(field.getAttribute("data-slot")).toBe("sidebar-input");
    expect(field.getAttribute("data-sidebar")).toBe("input");
    expect(field.closest("form")).not.toBeNull();
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("sidebar-01.tsx", "Sidebar01");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelector('[data-slot="sidebar-inset"]')).not.toBeNull();
    result.unmount();
  });
});
