import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import ContextMenuCheckboxes from "./context-menu-checkboxes.tsx";
import ContextMenuDemo from "./context-menu-demo.tsx";
import ContextMenuRadio from "./context-menu-radio.tsx";
import ContextMenuRtl from "./context-menu-rtl.tsx";
import ContextMenuSides from "./context-menu-sides.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const area = (at = 0): HTMLElement =>
  document.querySelectorAll<HTMLElement>('[data-slot="context-menu-trigger"]')[at] as HTMLElement;

async function open(at = 0): Promise<void> {
  user.rightClick(area(at), { clientX: 40, clientY: 30 });
  await settle();
}

async function close(): Promise<void> {
  await user.keyboard("{Escape}");
  await settle();
  expect(screen.queryAllByRole("menu")).toHaveLength(0);
}

const checked = (role: string, name: string): string | null =>
  screen.getByRole(role, { name }).getAttribute("aria-checked");

describe("the context menu examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("context-menu")).toEqual([]);
  });

  test("a right click opens the items, the toggles and the people", async () => {
    render(() => <ContextMenuDemo />);
    expect(screen.queryByRole("menu")).toBeNull();
    await open();
    expect(
      screen
        .getAllByRole("menuitem")
        .map((item) => item.firstChild?.textContent)
        .slice(0, 4),
    ).toEqual(["Back", "Forward", "Reload", "More Tools"]);
    expect(screen.getByRole("menuitem", { name: /Forward/ }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(checked("menuitemcheckbox", "Show Bookmarks")).toBe("true");
    expect(checked("menuitemradio", "Salama Ashoush")).toBe("true");
    await close();
  });

  test("Space turns a checkbox item over and leaves the menu open", async () => {
    render(() => <ContextMenuCheckboxes />);
    await open();
    expect(checked("menuitemcheckbox", "Show Bookmarks Bar")).toBe("true");
    expect(checked("menuitemcheckbox", "Show Full URLs")).toBe("false");
    screen.getByRole("menuitemcheckbox", { name: "Show Full URLs" }).focus();
    await user.keyboard(" ");
    await settle();
    expect(checked("menuitemcheckbox", "Show Full URLs")).toBe("true");
    expect(screen.getByRole("menu")).toBeTruthy();
    await close();
  });

  test("each radio group keeps its own choice", async () => {
    render(() => <ContextMenuRadio />);
    await open();
    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));
    await settle();
    await open();
    expect(checked("menuitemradio", "Dark")).toBe("true");
    expect(checked("menuitemradio", "Light")).toBe("false");
    expect(checked("menuitemradio", "Salama Ashoush")).toBe("true");
    await close();
  });

  test("each area opens its own menu", async () => {
    render(() => <ContextMenuSides />);
    expect(document.querySelectorAll('[data-slot="context-menu-trigger"]')).toHaveLength(4);
    await open(3);
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
    await close();
  });

  test("the right-to-left menu names its direction", async () => {
    render(() => <ContextMenuRtl />);
    await open();
    expect(screen.getByRole("menu").getAttribute("dir")).toBe("rtl");
    await close();
  });
});
