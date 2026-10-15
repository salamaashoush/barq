import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { Sidebar13 } from "./sidebar-13.tsx";
import { hydrateBlock } from "./test-harness.ts";

const dialog = (): Element | null => document.querySelector('[data-slot="dialog-content"]');

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("sidebar-13", () => {
  test("the dialog starts open, with the settings nav in it", async () => {
    render(() => <Sidebar13 />);
    await settle();
    expect(dialog()).not.toBeNull();
    expect(dialog()?.querySelector('[data-slot="sidebar"]')).not.toBeNull();
    expect(dialog()?.querySelectorAll('[data-slot="sidebar-menu-button"]')).toHaveLength(12);
    const active = dialog()?.querySelector('[data-slot="sidebar-menu-button"][data-active="true"]');
    expect(active?.textContent).toBe("Messages & media");
    expect(dialog()?.querySelector('[aria-current="page"]')?.textContent).toBe("Messages & media");
  });

  test("it is named and described for a screen reader", async () => {
    render(() => <Sidebar13 />);
    await settle();
    expect(screen.getByRole("dialog", { name: "Settings" })).not.toBeNull();
    expect(dialog()?.querySelector('[data-slot="dialog-description"]')?.textContent).toBe(
      "Customize your settings here.",
    );
  });

  test("closing it leaves the trigger, and the trigger opens it again", async () => {
    render(() => <Sidebar13 />);
    await settle();
    await user.click(dialog()?.querySelector('[data-slot="dialog-close"]') as HTMLElement);
    await settle();
    expect(dialog()).toBeNull();

    await user.click(screen.getByRole("button", { name: "Open Dialog" }));
    await settle();
    expect(dialog()).not.toBeNull();
  });

  test("the server's markup is claimed rather than rebuilt", async () => {
    const result = await hydrateBlock("sidebar-13.tsx", "Sidebar13");
    expect(result.mismatches).toEqual([]);
    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(result.container.querySelector('[data-slot="sidebar-13"]')).not.toBeNull();

    // The dialog is portalled out of the container, so removing the container
    // would leave it, open and modal, over every suite that runs after this one.
    await settle();
    await user.click(dialog()?.querySelector('[data-slot="dialog-close"]') as HTMLElement);
    await settle();
    expect(dialog()).toBeNull();
    result.unmount();
  });
});
