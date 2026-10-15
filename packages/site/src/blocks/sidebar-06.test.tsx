import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { Sidebar06 } from "./sidebar-06.tsx";
import { hydrateBlock } from "./test-harness.ts";

const sidebar = (): HTMLElement => document.querySelector('[data-slot="sidebar"]') as HTMLElement;

describe("sidebar-06", () => {
  test("each section is a menu button, and its pages open beside it", async () => {
    render(() => <Sidebar06 />);
    for (const name of ["Getting Started", "Build Your Application", "API Reference"]) {
      expect(screen.getByRole("button", { name }).getAttribute("aria-haspopup")).not.toBeNull();
    }

    const section = screen.getByRole("button", { name: "Architecture" });
    await user.click(section);
    flush();
    expect(section.getAttribute("aria-expanded")).toBe("true");
    const pages = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(pages).toEqual([
      "Accessibility",
      "Fast Refresh",
      "Next.js Compiler",
      "Supported Browsers",
      "Turbopack",
    ]);
  });

  test("the newsletter form has a named email field and a submit button", () => {
    render(() => <Sidebar06 />);
    expect(screen.getByText("Subscribe to our newsletter")).not.toBeNull();
    const email = screen.getByLabelText("Email");
    expect(email.getAttribute("type")).toBe("email");
    expect(email.closest("form")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Subscribe" }).getAttribute("type")).toBe("submit");
  });

  test("the trigger collapses the sidebar", async () => {
    render(() => <Sidebar06 />);
    expect(sidebar().getAttribute("data-state")).toBe("expanded");
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    expect(sidebar().getAttribute("data-state")).toBe("collapsed");
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("sidebar-06.tsx", "Sidebar06");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelector("form")).not.toBeNull();
    result.unmount();
  });

  test("a section's menu flies out with its pages as links", async () => {
    render(() => <Sidebar06 />);
    const trigger = screen.getByText("Getting Started").closest("button") as HTMLElement;
    expect(trigger.getAttribute("data-slot")).toBe("sidebar-menu-button");

    await user.click(trigger);
    flush();
    await tick();
    flush();
    const menu = document.querySelector('[role="menu"]') as HTMLElement;
    const links = [...menu.querySelectorAll("a")];
    expect(links.map((link) => link.textContent)).toEqual(["Installation", "Project Structure"]);
    expect(links.every((link) => link.getAttribute("href") === "#")).toBe(true);

    await user.keyboard("{Escape}");
    flush();
    await tick();
    flush();
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(0);
  });
});
