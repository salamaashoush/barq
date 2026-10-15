import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { Sidebar15 } from "./sidebar-15.tsx";
import { hydrateBlock } from "./test-harness.ts";

const sidebars = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('[data-slot="sidebar"]'),
];

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("sidebar-15", () => {
  test("there are two sidebars, one either side of the page", () => {
    render(() => <Sidebar15 />);
    expect(screen.getByText("Workspaces")).not.toBeNull();
    expect(screen.getByText("New Calendar")).not.toBeNull();

    const [left, right] = sidebars();
    expect(sidebars()).toHaveLength(2);
    const inset = document.querySelector('[data-slot="sidebar-inset"]') as HTMLElement;
    expect(
      (left as HTMLElement).compareDocumentPosition(inset) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      inset.compareDocumentPosition(right as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  test("the trigger collapses the left one, and the right one has no state to lose", async () => {
    render(() => <Sidebar15 />);
    const [left, right] = sidebars() as [HTMLElement, HTMLElement];
    expect(left.getAttribute("data-state")).toBe("expanded");
    expect(right.hasAttribute("data-state")).toBe(false);

    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    expect(left.getAttribute("data-state")).toBe("collapsed");
    expect(right.isConnected).toBe(true);
  });

  test("the right sidebar holds the calendar and the lists of calendars", () => {
    render(() => <Sidebar15 />);
    const right = sidebars()[1] as HTMLElement;
    const calendar = right.querySelector('[data-slot="calendar"]') as HTMLElement;
    expect(calendar.querySelector('[role="grid"]')).not.toBeNull();
    // `hidden`: the right sidebar is `display: none` below 64rem of preview,
    // and nothing here gives the preview a width.
    const list = (name: string): HTMLElement => screen.getByRole("button", { name, hidden: true });
    expect(list("My Calendars").getAttribute("aria-expanded")).toBe("true");
    expect(list("Other").getAttribute("aria-expanded")).toBe("false");
  });

  test("a workspace starts closed, and its chevron opens its pages", async () => {
    render(() => <Sidebar15 />);
    const toggle = screen.getByRole("button", { name: "Toggle Creative Projects" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await user.click(toggle);
    flush();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Art & Design Portfolio").closest("a")?.getAttribute("href")).toBe("#");
  });

  test("every favorite and page is drawn with an icon, never a glyph in the text", () => {
    render(() => <Sidebar15 />);
    const rows = [...sidebars()[0]!.querySelectorAll('a[data-slot^="sidebar-menu"]')];
    expect(rows.length).toBe(4 + 10 + 5 + 15 + 5);
    for (const row of rows) {
      expect(row.querySelector("svg"), row.textContent).not.toBeNull();
      expect(/\p{Extended_Pictographic}/u.test(row.textContent), row.textContent).toBe(false);
    }
  });

  test("the team switcher opens, and choosing a team renames its button", async () => {
    render(() => <Sidebar15 />);
    const switcher = screen.getByRole("button", { name: "Acme Inc" });

    await user.click(switcher);
    await settle();
    expect(screen.getByRole("menu", { name: "Teams" })).not.toBeNull();
    expect(screen.getAllByRole("menuitem")).toHaveLength(4);

    await user.click(screen.getByRole("menuitem", { name: /Evil Corp\./ }));
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(switcher.textContent).toBe("Evil Corp.");
  });

  test("the account menu opens from the right sidebar", async () => {
    render(() => <Sidebar15 />);
    const account = screen.getByRole("button", { name: /salama/, hidden: true });

    await user.click(account);
    await settle();
    expect(account.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("menuitem").map((node) => node.textContent)).toContain("Log out");
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("sidebar-15.tsx", "Sidebar15");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelectorAll('[data-slot="sidebar"]')).toHaveLength(2);
    result.unmount();
  });

  test("the account menu is a label, three groups and three rules", async () => {
    render(() => <Sidebar15 />);
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

  test("a favorite's menu holds its actions, with a rule before the last", async () => {
    render(() => <Sidebar15 />);
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
    render(() => <Sidebar15 />);
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
