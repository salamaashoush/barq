import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { Sidebar10 } from "./sidebar-10.tsx";
import { hydrateBlock } from "./test-harness.ts";

const shell = (): HTMLElement =>
  document.querySelector('[data-slot="sidebar"][data-state]') as HTMLElement;
const panel = (): Element | null => document.querySelector('[data-slot="popover-content"]');

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("sidebar-10", () => {
  test("the team, the favourites and the workspaces are all there", () => {
    render(() => <Sidebar10 />);
    for (const label of ["Acme Inc", "Favorites", "Workspaces", "Ask AI", "Templates"]) {
      expect(screen.getByText(label)).not.toBeNull();
    }
    expect(screen.getByText("Home").closest("a")?.getAttribute("data-active")).toBe("true");
    expect(
      screen.getByText("Book Notes & Reading List").closest("a")?.querySelector("svg"),
    ).not.toBe(null);
  });

  test("the trigger collapses it", async () => {
    render(() => <Sidebar10 />);
    expect(shell().getAttribute("data-state")).toBe("expanded");
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    expect(shell().getAttribute("data-state")).toBe("collapsed");
  });

  test("a workspace opens to its pages", async () => {
    render(() => <Sidebar10 />);
    const toggle = screen.getByRole("button", { name: "Toggle Creative Projects" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    flush();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByRole("button", { name: "Toggle Home Management" }).getAttribute("aria-expanded"),
    ).toBe("false");
  });

  test("the page actions open in a popover once the page settles, and close from the trigger", async () => {
    render(() => <Sidebar10 />);
    await settle();
    expect(panel()).not.toBeNull();
    expect(panel()?.querySelector('[data-slot="sidebar"]')).not.toBeNull();
    expect(screen.getByText("Turn into wiki")).not.toBeNull();
    expect(panel()?.querySelectorAll('[data-slot="sidebar-group"]')).toHaveLength(4);

    await user.click(screen.getByRole("button", { name: "Page actions" }));
    await settle();
    expect(panel()).toBeNull();
  });

  test("the team button opens the teams, and choosing one names it", async () => {
    render(() => <Sidebar10 />);
    // The page actions open themselves, and while they are open the first
    // press anywhere else only dismisses them.
    await settle();
    await user.click(screen.getByRole("button", { name: "Page actions" }));
    await settle();

    const trigger = screen.getByText("Acme Inc").closest("button") as HTMLElement;
    expect(trigger.getAttribute("data-slot")).toBe("sidebar-menu-button");
    await user.click(trigger);
    await settle();
    const menu = document.querySelector('[role="menu"][aria-label="Teams"]');
    const items = [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    expect(items.map((item) => item.textContent)).toEqual([
      "Acme Inc⌘1",
      "Acme Corp.⌘2",
      "Evil Corp.⌘3",
      "Add team",
    ]);

    await user.click(items[1] as HTMLElement);
    await settle();
    expect(trigger.textContent).toBe("Acme Corp.");
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("sidebar-10.tsx", "Sidebar10");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    // The popover is the client's: the server has no trigger to anchor it to.
    expect(result.html).not.toContain("Turn into wiki");
    result.unmount();
  });

  test("a favorite's menu holds its actions, with a rule before the last", async () => {
    render(() => <Sidebar10 />);
    await user.click(
      document.querySelector('[data-slot="sidebar-menu-action"][aria-haspopup]') as HTMLElement,
    );
    flush();
    await tick();
    flush();
    const menu = document.querySelector(
      '[role="menu"][aria-label="Favorite actions"]',
    ) as HTMLElement;
    expect([...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)).toEqual(
      ["Remove from Favorites", "Copy Link", "Open in New Tab", "Delete"],
    );
    expect(menu.querySelectorAll('[data-slot="dropdown-menu-separator"]')).toHaveLength(2);

    await user.keyboard("{Escape}");
    flush();
    await tick();
    flush();
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(0);
  });

  test("the team menu is labelled, lists the teams with shortcuts, then offers to add one", async () => {
    render(() => <Sidebar10 />);
    await user.click(screen.getByText("Acme Inc").closest("button") as HTMLElement);
    flush();
    await tick();
    flush();
    const menu = document.querySelector('[role="menu"][aria-label="Teams"]') as HTMLElement;
    expect(menu.querySelector('[data-slot="dropdown-menu-label"]')?.textContent).toBe("Teams");
    expect(menu.querySelectorAll('[data-slot="dropdown-menu-shortcut"]')).toHaveLength(3);
    expect(menu.querySelectorAll('[data-slot="dropdown-menu-separator"]')).toHaveLength(1);
    expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(4);
    expect(menu.lastElementChild?.textContent).toBe("Add team");

    await user.keyboard("{Escape}");
    flush();
    await tick();
    flush();
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(0);
  });
});
