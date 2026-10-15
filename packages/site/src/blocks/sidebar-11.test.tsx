import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { Sidebar11 } from "./sidebar-11.tsx";
import { hydrateBlock } from "./test-harness.ts";

const shell = (): HTMLElement => document.querySelector('[data-slot="sidebar"]') as HTMLElement;
// By text rather than by role: a folder inside a collapsed one is out of the
// accessibility tree, and its own state is still what the test is about.
const folder = (name: string): HTMLElement =>
  [
    ...document.querySelectorAll<HTMLElement>('[data-slot="sidebar-menu-button"][aria-expanded]'),
  ].find((button) => button.textContent === name) as HTMLElement;

describe("sidebar-11", () => {
  test("the changes carry their state, and the tree its files", () => {
    render(() => <Sidebar11 />);
    expect(screen.getByText("Changes")).not.toBeNull();
    expect(screen.getByText("Files")).not.toBeNull();
    const badges = [...document.querySelectorAll('[data-slot="sidebar-menu-badge"]')];
    expect(badges.map((badge) => badge.textContent)).toEqual(["M", "U", "M"]);
    expect(screen.getByText("tailwind.config.js")).not.toBeNull();
    expect(screen.getByText("vercel.svg")).not.toBeNull();
  });

  test("the open file is marked, in the tree and in the trail", () => {
    render(() => <Sidebar11 />);
    const active = [...document.querySelectorAll('[data-slot="sidebar-menu-button"]')].filter(
      (button) => button.getAttribute("data-active") === "true",
    );
    expect(active.map((button) => button.textContent)).toEqual(["button.tsx"]);
    expect(document.querySelector('[aria-current="page"]')?.textContent).toBe("button.tsx");
  });

  test("components and ui start open, and a folder toggles on its own", async () => {
    render(() => <Sidebar11 />);
    expect(folder("components").getAttribute("aria-expanded")).toBe("true");
    expect(folder("ui").getAttribute("aria-expanded")).toBe("true");
    expect(folder("app").getAttribute("aria-expanded")).toBe("false");

    await user.click(folder("app"));
    flush();
    expect(folder("app").getAttribute("aria-expanded")).toBe("true");
    expect(folder("app").getAttribute("data-state")).toBe("open");
    // A directory inside it keeps its own state.
    expect(folder("api").getAttribute("aria-expanded")).toBe("false");

    await user.click(folder("components"));
    flush();
    expect(folder("components").getAttribute("aria-expanded")).toBe("false");
    expect(folder("ui").getAttribute("aria-expanded")).toBe("true");
  });

  test("the trigger and the rail both collapse it", async () => {
    render(() => <Sidebar11 />);
    await user.click(document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement);
    flush();
    expect(shell().getAttribute("data-state")).toBe("collapsed");
    await user.click(document.querySelector('[data-slot="sidebar-rail"]') as HTMLElement);
    flush();
    expect(shell().getAttribute("data-state")).toBe("expanded");
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("sidebar-11.tsx", "Sidebar11");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelectorAll('[data-slot="sidebar-menu-sub"]').length).toBe(8);
    result.unmount();
  });
});
