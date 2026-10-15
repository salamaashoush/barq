import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { Sidebar05 } from "./sidebar-05.tsx";
import { hydrateBlock } from "./test-harness.ts";

const sidebar = (): HTMLElement => document.querySelector('[data-slot="sidebar"]') as HTMLElement;

describe("sidebar-05", () => {
  test("only the second section starts open", () => {
    render(() => <Sidebar05 />);
    const expanded = (name: string): string | null =>
      screen.getByRole("button", { name }).getAttribute("aria-expanded");

    expect(expanded("Getting Started")).toBe("false");
    expect(expanded("Build Your Application")).toBe("true");
    expect(expanded("API Reference")).toBe("false");
    expect(expanded("Architecture")).toBe("false");
    expect(expanded("Community")).toBe("false");
  });

  test("a section's button opens its submenu, and closes it again", async () => {
    render(() => <Sidebar05 />);
    const button = screen.getByRole("button", { name: "Community" });
    const panel = button
      .closest('[data-slot="sidebar-menu-item"]')
      ?.querySelector('[data-slot="collapsible-content"]') as HTMLElement;
    expect(panel.hasAttribute("data-expanded")).toBe(false);

    await user.click(button);
    flush();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hasAttribute("data-expanded")).toBe(true);

    await user.click(button);
    flush();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(panel.hasAttribute("data-expanded")).toBe(false);
  });

  test("the trigger collapses the sidebar", async () => {
    render(() => <Sidebar05 />);
    expect(sidebar().getAttribute("data-state")).toBe("expanded");
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    expect(sidebar().getAttribute("data-state")).toBe("collapsed");
  });

  test("the search field is labelled", () => {
    render(() => <Sidebar05 />);
    expect(screen.getByLabelText("Search").getAttribute("placeholder")).toBe("Search the docs...");
  });

  test("a section's row is the trigger of the collapsible around it", async () => {
    render(() => <Sidebar05 />);
    expect(document.querySelector('[data-slot="collapsible-trigger"]')).toBeNull();
    const button = screen.getByRole("button", { name: "API Reference" });
    expect(button.getAttribute("data-slot")).toBe("sidebar-menu-button");
    const root = button.closest('[data-slot="collapsible"]') as HTMLElement;
    expect(root.getAttribute("data-state")).toBe("closed");
    expect(root.querySelector('[data-slot="sidebar-menu-item"]')?.contains(button)).toBe(true);
    const panel = root.querySelector('[data-slot="collapsible-content"]') as HTMLElement;
    expect(button.getAttribute("aria-controls")).toBe(panel.id);

    button.focus();
    await user.keyboard("{Enter}");
    flush();
    expect(root.getAttribute("data-state")).toBe("open");
    expect(button.getAttribute("data-state")).toBe("open");
    const open = [...document.querySelectorAll('[data-slot="collapsible"][data-state="open"]')];
    expect(open).toHaveLength(2);
  });

  test("the search field is the sidebar's own input", () => {
    render(() => <Sidebar05 />);
    const field = screen.getByLabelText("Search");
    expect(field.getAttribute("data-slot")).toBe("sidebar-input");
    expect(field.getAttribute("data-sidebar")).toBe("input");
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("sidebar-05.tsx", "Sidebar05");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelectorAll('[data-slot="collapsible"]')).toHaveLength(5);
    result.unmount();
  });
});
