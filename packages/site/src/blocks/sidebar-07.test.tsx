import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { Sidebar07 } from "./sidebar-07.tsx";
import { hydrateBlock } from "./test-harness.ts";

const sidebar = (root: ParentNode): HTMLElement =>
  root.querySelector('[data-slot="sidebar"]') as HTMLElement;

describe("sidebar-07", () => {
  test("the two groups, the breadcrumb and the team are on the page", () => {
    render(() => <Sidebar07 />);
    expect(screen.getByText("Platform")).not.toBeNull();
    expect(screen.getByText("Projects")).not.toBeNull();
    expect(screen.getByText("Data Fetching")).not.toBeNull();
    expect(screen.getByText("Acme Inc")).not.toBeNull();
  });

  test("the trigger collapses it to icons rather than off the canvas", async () => {
    render(() => <Sidebar07 />);
    expect(sidebar(document).getAttribute("data-state")).toBe("expanded");
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    expect(sidebar(document).getAttribute("data-state")).toBe("collapsed");
    expect(sidebar(document).getAttribute("data-collapsible")).toBe("icon");
  });

  test("a section opens on its own, without opening its neighbours", async () => {
    render(() => <Sidebar07 />);
    const playground = screen.getByRole("button", { name: "Playground" });
    const models = screen.getByRole("button", { name: "Models" });
    expect(playground.getAttribute("aria-expanded")).toBe("true");
    expect(models.getAttribute("aria-expanded")).toBe("false");

    await user.click(models);
    flush();
    expect(models.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Settings" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("sidebar-07.tsx", "Sidebar07");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);

    await user.click(
      result.container.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement,
    );
    flush();
    expect(sidebar(result.container).getAttribute("data-state")).toBe("collapsed");
    result.unmount();
  });

  test("the account menu is a label, three groups and three rules", async () => {
    render(() => <Sidebar07 />);
    await user.click(screen.getByText("sashoush").closest("button") as HTMLElement);
    flush();
    await tick();
    flush();
    const menu = document.querySelector('[role="menu"][aria-label="Account"]') as HTMLElement;
    expect(menu.querySelector('[data-slot="dropdown-menu-label"]')?.textContent).toContain(
      "sashoush",
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
    render(() => <Sidebar07 />);
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

  test("the team menu is labelled, lists the teams with shortcuts, then offers to add one", async () => {
    render(() => <Sidebar07 />);
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
