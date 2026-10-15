import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import MenubarDemo from "./menubar-demo.tsx";
import MenubarIcons from "./menubar-icons.tsx";
import MenubarRadio from "./menubar-radio.tsx";
import MenubarRtl from "./menubar-rtl.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

async function open(name: string): Promise<void> {
  await user.click(screen.getByRole("menuitem", { name }));
  await settle();
}

async function close(): Promise<void> {
  await user.keyboard("{Escape}");
  await settle();
  expect(screen.queryAllByRole("menu")).toHaveLength(0);
}

const checked = (role: string, name: string): string | null =>
  screen.getByRole(role, { name }).getAttribute("aria-checked");

describe("the menubar examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("menubar")).toEqual([]);
  });

  test("the bar holds four menus and the first opens its items", async () => {
    render(() => <MenubarDemo />);
    expect(screen.getByRole("menubar")).toBeTruthy();
    await open("File");
    const menu = screen.getByRole("menu");
    expect(
      [...menu.querySelectorAll('[role="menuitem"]')].map((item) =>
        item.firstChild?.textContent?.trim(),
      ),
    ).toEqual(["New Tab", "New Window", "New Incognito Window", "Share", "Print..."]);
    await close();
  });

  test("the view menu keeps its checkbox state and the profiles their choice", async () => {
    render(() => <MenubarDemo />);
    await open("View");
    expect(checked("menuitemcheckbox", "Full URLs")).toBe("true");
    expect(checked("menuitemcheckbox", "Bookmarks Bar")).toBe("false");
    await close();
    await open("Profiles");
    expect(checked("menuitemradio", "Mira")).toBe("true");
    await close();
  });

  test("a radio choice moves", async () => {
    render(() => <MenubarRadio />);
    await open("Theme");
    expect(checked("menuitemradio", "System")).toBe("true");
    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));
    await settle();
    await open("Theme");
    expect(checked("menuitemradio", "Dark")).toBe("true");
    await close();
  });

  test("the destructive item says so", async () => {
    render(() => <MenubarIcons />);
    await open("More");
    expect(screen.getByRole("menuitem", { name: "Delete" }).getAttribute("data-variant")).toBe(
      "destructive",
    );
    await close();
  });

  test("the right-to-left menus name their direction", async () => {
    render(() => <MenubarRtl />);
    expect(document.querySelector('[dir="rtl"] [role="menubar"]')).not.toBeNull();
    await open("ملف");
    expect(screen.getByRole("menu").getAttribute("dir")).toBe("rtl");
    await close();
  });
});
