import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { Sidebar12 } from "./sidebar-12.tsx";
import { hydrateBlock } from "./test-harness.ts";

const sidebar = (): HTMLElement => document.querySelector('[data-slot="sidebar"]') as HTMLElement;

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("sidebar-12", () => {
  test("the sidebar holds a calendar, drawn as a grid of seven weekdays", () => {
    render(() => <Sidebar12 />);
    expect(screen.getByText("October 2024")).not.toBeNull();
    expect(screen.getByText("New Calendar")).not.toBeNull();

    const calendar = sidebar().querySelector('[data-slot="calendar"]') as HTMLElement;
    expect(calendar.querySelector('[role="grid"]')).not.toBeNull();
    expect(calendar.querySelectorAll('[data-slot="calendar-weekday"]')).toHaveLength(7);
  });

  test("only the first list of calendars starts open, and a press opens another", async () => {
    render(() => <Sidebar12 />);
    const mine = screen.getByRole("button", { name: "My Calendars" });
    const other = screen.getByRole("button", { name: "Other" });
    expect(mine.getAttribute("aria-expanded")).toBe("true");
    expect(other.getAttribute("aria-expanded")).toBe("false");

    await user.click(other);
    flush();
    expect(other.getAttribute("aria-expanded")).toBe("true");
  });

  test("the first two calendars of a list are ticked", () => {
    render(() => <Sidebar12 />);
    const ticked = (name: string): string | null | undefined =>
      screen
        .getByRole("button", { name })
        .querySelector("[data-active]")
        ?.getAttribute("data-active");
    expect(ticked("Personal")).toBe("true");
    expect(ticked("Work")).toBe("true");
    expect(ticked("Family")).toBe("false");
  });

  test("the header names the account, on the control that opens its menu", () => {
    render(() => <Sidebar12 />);
    const account = screen.getByRole("button", { name: /salama/ });
    expect(account.closest('[data-slot="sidebar-header"]')).not.toBeNull();
    expect(account.textContent).toContain("m@example.com");
    expect(account.getAttribute("data-size")).toBe("lg");
  });

  test("the account menu opens from the header", async () => {
    render(() => <Sidebar12 />);
    const account = screen.getByRole("button", { name: /salama/ });
    expect(account.getAttribute("aria-expanded")).toBe("false");

    await user.click(account);
    await settle();
    expect(account.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menu", { name: "Account" })).not.toBeNull();
    expect(screen.getAllByRole("menuitem").map((node) => node.textContent)).toEqual([
      "Upgrade to Pro",
      "Account",
      "Billing",
      "Notifications",
      "Log out",
    ]);
  });

  test("the trigger collapses it", async () => {
    render(() => <Sidebar12 />);
    expect(sidebar().getAttribute("data-state")).toBe("expanded");
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    expect(sidebar().getAttribute("data-state")).toBe("collapsed");
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("sidebar-12.tsx", "Sidebar12");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelector('[data-slot="calendar"]')).not.toBeNull();
    result.unmount();
  });

  test("the account menu is a label, three groups and three rules", async () => {
    render(() => <Sidebar12 />);
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
