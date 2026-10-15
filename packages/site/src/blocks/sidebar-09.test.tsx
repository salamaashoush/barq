import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { Sidebar09 } from "./sidebar-09.tsx";
import { hydrateBlock } from "./test-harness.ts";

const shell = (): HTMLElement =>
  document.querySelector('[data-slot="sidebar"][data-state]') as HTMLElement;
const folder = (): string => document.querySelector('[data-slot="mail-folder"]')?.textContent ?? "";
const mails = (): Element[] => [...document.querySelectorAll('[data-slot="mail"]')];

describe("sidebar-09", () => {
  test("an icon rail and a mail list share one sidebar", () => {
    render(() => <Sidebar09 />);
    // The outer sidebar collapses; the two inside it never do.
    expect(document.querySelectorAll('[data-slot="sidebar"]')).toHaveLength(3);
    expect(shell().getAttribute("data-state")).toBe("expanded");
    expect(folder()).toBe("Inbox");
    expect(mails()).toHaveLength(10);
    expect(screen.getByText("Meeting Tomorrow")).not.toBeNull();
    expect(screen.getByPlaceholderText("Type to search...")).not.toBeNull();
    expect(screen.getByLabelText("Unreads").getAttribute("type")).toBe("checkbox");
  });

  test("the provider carries the wider column's width", () => {
    render(() => <Sidebar09 />);
    const wrapper = document.querySelector('[data-slot="sidebar-wrapper"]') as HTMLElement;
    expect(wrapper.style.getPropertyValue("--sidebar-width")).toBe("350px");
  });

  test("the trigger collapses it to the rail", async () => {
    render(() => <Sidebar09 />);
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    expect(shell().getAttribute("data-state")).toBe("collapsed");
    expect(shell().getAttribute("data-collapsible")).toBe("icon");
  });

  test("a folder names the list, refills it and reopens a collapsed sidebar", async () => {
    render(() => <Sidebar09 />);
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();

    const drafts = screen.getByRole("button", { name: "Drafts" });
    expect(drafts.getAttribute("data-active")).toBe("false");
    await user.click(drafts);
    flush();

    expect(folder()).toBe("Drafts");
    expect(drafts.getAttribute("data-active")).toBe("true");
    expect(screen.getByRole("button", { name: "Inbox" }).getAttribute("data-active")).toBe("false");
    expect(mails().length).toBeGreaterThanOrEqual(5);
    expect(mails().length).toBeLessThanOrEqual(10);
    expect(shell().getAttribute("data-state")).toBe("expanded");
  });

  test("the user's button opens the account menu", async () => {
    render(() => <Sidebar09 />);
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
    const result = await hydrateBlock("sidebar-09.tsx", "Sidebar09");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelectorAll('[data-slot="mail"]')).toHaveLength(10);
    result.unmount();
  });

  test("the account menu is a label, three groups and three rules", async () => {
    render(() => <Sidebar09 />);
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
});
