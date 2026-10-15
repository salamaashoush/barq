import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { Sidebar16 } from "./sidebar-16.tsx";
import { hydrateBlock } from "./test-harness.ts";

const sidebar = (): HTMLElement => document.querySelector('[data-slot="sidebar"]') as HTMLElement;

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("sidebar-16", () => {
  test("the site header sits above the sidebar, inside the provider", () => {
    render(() => <Sidebar16 />);
    expect(screen.getByText("Acme Inc")).not.toBeNull();
    expect(screen.getByText("Platform")).not.toBeNull();

    const header = document.querySelector("header") as HTMLElement;
    expect(header.closest('[data-slot="sidebar-wrapper"]')).not.toBeNull();
    expect(header.compareDocumentPosition(sidebar()) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
      0,
    );
    expect(sidebar().parentElement?.querySelector('[data-slot="sidebar-inset"]')).not.toBeNull();
  });

  test("the header's search field is labelled", () => {
    render(() => <Sidebar16 />);
    const search = screen.getByLabelText("Search");
    expect(search.tagName).toBe("INPUT");
    expect(search.getAttribute("placeholder")).toBe("Type to search...");
    expect(search.closest("header")).not.toBeNull();
  });

  test("the header's button collapses the sidebar", async () => {
    render(() => <Sidebar16 />);
    expect(sidebar().getAttribute("data-state")).toBe("expanded");
    await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    flush();
    expect(sidebar().getAttribute("data-state")).toBe("collapsed");
    expect(sidebar().getAttribute("data-collapsible")).toBe("offcanvas");
  });

  test("only the active section starts open, and its chevron opens another", async () => {
    render(() => <Sidebar16 />);
    const toggles = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-slot="sidebar-menu-item"][data-state] [data-slot="sidebar-menu-action"][aria-expanded]',
      ),
    ];
    expect(toggles.map((node) => node.getAttribute("aria-expanded"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);

    await user.click(toggles[1] as HTMLElement);
    flush();
    expect(toggles[1]?.getAttribute("aria-expanded")).toBe("true");
    expect(toggles[1]?.getAttribute("data-state")).toBe("open");
    expect(
      toggles[1]
        ?.closest('[data-slot="sidebar-menu-item"][data-state]')
        ?.getAttribute("data-state"),
    ).toBe("open");
    expect(toggles[0]?.getAttribute("aria-expanded")).toBe("true");
  });

  test("a section's row names itself once the sidebar is a rail of icons", () => {
    render(() => <Sidebar16 />);
    const rows = [...sidebar().querySelectorAll('[data-slot="sidebar-menu-item"][data-state] > a')];
    expect(rows.map((row) => row.textContent)).toEqual([
      "Playground",
      "Models",
      "Documentation",
      "Settings",
    ]);
    // Expanded, the label is on screen and the tooltip stays out of the way.
    for (const row of rows) expect(row.hasAttribute("aria-describedby")).toBe(false);
  });

  test("a project's action opens its menu, with the delete set apart", async () => {
    render(() => <Sidebar16 />);
    const actions = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-slot="sidebar-menu-action"][aria-haspopup="true"]',
      ),
    ];
    expect(actions).toHaveLength(3);
    const action = actions[0] as HTMLElement;
    expect(action.textContent).toBe("More");

    await user.click(action);
    await settle();
    expect(action.getAttribute("data-state")).toBe("open");
    const menu = screen.getByRole("menu", { name: "Project actions" });
    expect([...menu.children].map((child) => child.getAttribute("data-slot"))).toEqual([
      "dropdown-menu-item",
      "dropdown-menu-item",
      "dropdown-menu-separator",
      "dropdown-menu-item",
    ]);
    expect(screen.getAllByRole("menuitem").map((node) => node.textContent)).toEqual([
      "View Project",
      "Share Project",
      "Delete Project",
    ]);

    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(action.getAttribute("aria-expanded")).toBe("false");
  });

  test("the account menu opens from the footer", async () => {
    render(() => <Sidebar16 />);
    const account = screen.getByRole("button", { name: /salama/ });
    expect(account.closest('[data-slot="sidebar-footer"]')).not.toBeNull();

    await user.click(account);
    await settle();
    expect(account.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("menuitem").map((node) => node.textContent)).toEqual([
      "Upgrade to Pro",
      "Account",
      "Billing",
      "Notifications",
      "Log out",
    ]);

    const menu = screen.getByRole("menu", { name: "Account" });
    expect([...menu.children].map((child) => child.getAttribute("data-slot"))).toEqual([
      "dropdown-menu-label",
      "dropdown-menu-separator",
      null,
      "dropdown-menu-separator",
      null,
      "dropdown-menu-separator",
      "dropdown-menu-item",
    ]);
    expect(menu.querySelector('[data-slot="dropdown-menu-label"]')?.textContent).toContain(
      "m@example.com",
    );
    const groups = [...menu.querySelectorAll('[role="group"]')];
    expect(groups.map((group) => group.querySelectorAll('[role="menuitem"]').length)).toEqual([
      1, 3,
    ]);

    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(account.getAttribute("aria-expanded")).toBe("false");
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("sidebar-16.tsx", "Sidebar16");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelector("header input#search")).not.toBeNull();
    result.unmount();
  });
});
