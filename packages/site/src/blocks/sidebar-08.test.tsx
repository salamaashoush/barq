import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { Sidebar08 } from "./sidebar-08.tsx";
import { hydrateBlock } from "./test-harness.ts";

const shell = (): HTMLElement => document.querySelector('[data-slot="sidebar"]') as HTMLElement;

describe("sidebar-08", () => {
  test("the inset sidebar carries the three groups and the user", () => {
    render(() => <Sidebar08 />);
    expect(shell().getAttribute("data-variant")).toBe("inset");
    for (const label of ["Platform", "Projects", "Support", "Feedback", "salama"]) {
      expect(screen.getByText(label)).not.toBeNull();
    }
    expect(screen.getByText("Data Fetching").getAttribute("aria-current")).toBe("page");
  });

  test("the trigger collapses it", async () => {
    render(() => <Sidebar08 />);
    expect(shell().getAttribute("data-state")).toBe("expanded");
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    expect(shell().getAttribute("data-state")).toBe("collapsed");
    expect(shell().getAttribute("data-collapsible")).toBe("offcanvas");
  });

  test("a row's chevron opens its sub-items, and only its own", async () => {
    render(() => <Sidebar08 />);
    const toggles = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-slot="sidebar-menu-item"][data-state] [data-slot="sidebar-menu-action"][aria-expanded]',
      ),
    ];
    expect(toggles).toHaveLength(4);
    expect(toggles.map((each) => each.getAttribute("aria-expanded"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);

    await user.click(toggles[1] as HTMLElement);
    flush();
    expect(toggles[1]?.getAttribute("aria-expanded")).toBe("true");
    expect(toggles[1]?.getAttribute("data-state")).toBe("open");
    expect(toggles[2]?.getAttribute("aria-expanded")).toBe("false");
  });

  test("the user's button opens the account menu", async () => {
    render(() => <Sidebar08 />);
    const trigger = screen.getByText("salama").closest("button") as HTMLElement;
    expect(trigger.getAttribute("data-slot")).toBe("sidebar-menu-button");
    await user.click(trigger);
    flush();
    const menu = document.querySelector('[role="menu"]');
    expect(menu?.getAttribute("aria-label")).toBe("Account");
    expect(menu?.querySelectorAll('[role="menuitem"]')).toHaveLength(5);
    expect(menu?.textContent).toContain("Log out");
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("sidebar-08.tsx", "Sidebar08");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelector('[data-slot="sidebar-inset"]')).not.toBeNull();
    result.unmount();
  });

  test("the account menu is a label, three groups and three rules", async () => {
    render(() => <Sidebar08 />);
    await user.click(screen.getByText("salama").closest("button") as HTMLElement);
    flush();
    await tick();
    flush();
    const menu = document.querySelector('[role="menu"][aria-label="Account"]') as HTMLElement;
    expect(menu.querySelector('[data-slot="dropdown-menu-label"]')?.textContent).toContain(
      "salama",
    );
    expect(menu.querySelectorAll('[data-slot="dropdown-menu-separator"]')).toHaveLength(3);
    expect(menu.querySelectorAll('[data-slot="dropdown-menu-group"]')).toHaveLength(2);
    expect([...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)).toEqual(
      ["Upgrade to Pro", "Account", "Billing", "Notifications", "Log out"],
    );

    await user.keyboard("{Escape}");
    flush();
    await tick();
    flush();
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(0);
  });

  test("a project's menu holds its actions, with a rule before the last", async () => {
    render(() => <Sidebar08 />);
    await user.click(
      document.querySelector('[data-slot="sidebar-menu-action"][aria-haspopup]') as HTMLElement,
    );
    flush();
    await tick();
    flush();
    const menu = document.querySelector(
      '[role="menu"][aria-label="Project actions"]',
    ) as HTMLElement;
    expect([...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)).toEqual(
      ["View Project", "Share Project", "Delete Project"],
    );
    expect(menu.querySelectorAll('[data-slot="dropdown-menu-separator"]')).toHaveLength(1);

    await user.keyboard("{Escape}");
    flush();
    await tick();
    flush();
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(0);
  });
});
