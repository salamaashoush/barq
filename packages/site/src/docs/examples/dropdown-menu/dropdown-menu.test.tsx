import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import DropdownMenuAvatar from "./dropdown-menu-avatar.tsx";
import DropdownMenuCheckboxesIcons from "./dropdown-menu-checkboxes-icons.tsx";
import DropdownMenuCheckboxes from "./dropdown-menu-checkboxes.tsx";
import DropdownMenuComplex from "./dropdown-menu-complex.tsx";
import DropdownMenuDemo from "./dropdown-menu-demo.tsx";
import DropdownMenuIcons from "./dropdown-menu-icons.tsx";
import DropdownMenuItems from "./dropdown-menu-items.tsx";
import DropdownMenuRadioGroup from "./dropdown-menu-radio-group.tsx";
import DropdownMenuRadioIcons from "./dropdown-menu-radio-icons.tsx";
import DropdownMenuRtl from "./dropdown-menu-rtl.tsx";
import DropdownMenuSubmenu from "./dropdown-menu-submenu.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

async function open(name: string): Promise<void> {
  await user.click(screen.getByRole("button", { name }));
  await settle();
}

async function close(): Promise<void> {
  await user.keyboard("{Escape}");
  await settle();
  expect(screen.queryAllByRole("menu")).toHaveLength(0);
}

const labels = (role: string): (string | null | undefined)[] =>
  screen.getAllByRole(role).map((item) => item.firstChild?.textContent);

const checked = (role: string, name: string): string | null =>
  screen.getByRole(role, { name }).getAttribute("aria-checked");

describe("the dropdown menu examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("dropdown-menu")).toEqual([]);
  });

  test("the first example opens its items in the written order, in four groups", async () => {
    render(() => <DropdownMenuDemo />);
    expect(screen.queryByRole("menu")).toBeNull();
    await open("Open");

    expect(labels("menuitem")).toEqual([
      "Profile",
      "Billing",
      "Settings",
      "Team",
      "Invite users",
      "New Team",
      "Repository",
      "Support",
      "API",
      "Log out",
    ]);
    expect(screen.getAllByRole("group")).toHaveLength(4);
    expect(screen.getAllByRole("separator")).toHaveLength(3);
    expect(screen.getByRole("menuitem", { name: "API" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(document.querySelector('[data-slot="dropdown-menu-shortcut"]')?.textContent).toBe("⇧⌘P");
    await close();
  });

  test("a submenu opens from its row, and another opens inside it", async () => {
    render(() => <DropdownMenuSubmenu />);
    screen.getByRole("button", { name: "Open" }).focus();
    await user.keyboard("{ArrowDown}");
    await settle();
    await user.keyboard("{ArrowDown}{ArrowRight}");
    await settle();

    const invite = screen.getByRole("menu", { name: "Invite users" });
    expect(invite.getAttribute("data-slot")).toBe("dropdown-menu-sub-content");
    expect(document.activeElement?.textContent).toBe("Email");

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowRight}");
    await settle();
    const more = screen.getByRole("menu", { name: "More options" });
    expect([...more.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)).toEqual(
      ["Calendar", "Chat", "Webhook"],
    );

    await user.click(screen.getByRole("menuitem", { name: "Chat" }));
    await settle();
    expect(screen.queryAllByRole("menu")).toHaveLength(0);
  });

  test("an icon sits before its label, and the destructive item says so", async () => {
    render(() => <DropdownMenuIcons />);
    await open("Open");

    const logOut = screen.getByRole("menuitem", { name: "Log out" });
    expect(logOut.getAttribute("data-variant")).toBe("destructive");
    expect(logOut.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    expect(screen.getAllByRole("menuitem")).toHaveLength(4);
    await close();
  });

  test("a checkbox item turns over and the menu shows it the next time it opens", async () => {
    render(() => <DropdownMenuCheckboxes />);
    await open("Open");
    expect(checked("menuitemcheckbox", "Status Bar")).toBe("true");
    expect(checked("menuitemcheckbox", "Panel")).toBe("false");
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Activity Bar" }).getAttribute("aria-disabled"),
    ).toBe("true");

    await user.click(screen.getByRole("menuitemcheckbox", { name: "Panel" }));
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();

    await open("Open");
    expect(checked("menuitemcheckbox", "Panel")).toBe("true");
    expect(checked("menuitemcheckbox", "Status Bar")).toBe("true");
    await close();
  });

  test("Space toggles a checkbox item held in one object and leaves the menu open", async () => {
    render(() => <DropdownMenuCheckboxesIcons />);
    screen.getByRole("button", { name: "Notifications" }).focus();
    await user.keyboard("{ArrowDown}");
    await settle();
    expect(checked("menuitemcheckbox", "Email notifications")).toBe("true");
    expect(checked("menuitemcheckbox", "SMS notifications")).toBe("false");

    await user.keyboard("{ArrowDown} ");
    await settle();
    expect(checked("menuitemcheckbox", "SMS notifications")).toBe("true");
    expect(checked("menuitemcheckbox", "Email notifications")).toBe("true");
    expect(checked("menuitemcheckbox", "Push notifications")).toBe("true");
    expect(screen.getByRole("menu")).toBeTruthy();
    await close();
  });

  test("a radio group moves its one choice", async () => {
    render(() => <DropdownMenuRadioGroup />);
    await open("Open");
    expect(screen.getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual([
      "Top",
      "Bottom",
      "Right",
    ]);
    expect(checked("menuitemradio", "Bottom")).toBe("true");

    await user.click(screen.getByRole("menuitemradio", { name: "Top" }));
    await settle();
    await open("Open");
    expect(checked("menuitemradio", "Top")).toBe("true");
    expect(checked("menuitemradio", "Bottom")).toBe("false");
    await close();
  });

  test("radio items with icons start on the card", async () => {
    render(() => <DropdownMenuRadioIcons />);
    await open("Payment Method");
    expect(checked("menuitemradio", "Credit Card")).toBe("true");
    expect(checked("menuitemradio", "Bank Transfer")).toBe("false");
    await close();
  });

  test("the avatar is the trigger", async () => {
    render(() => <DropdownMenuAvatar />);
    const trigger = screen.getByRole("button", { name: "Account" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("true");
    expect(trigger.querySelector('[data-slot="avatar-fallback"]')?.textContent).toBe("SA");

    await open("Account");
    expect(labels("menuitem").length).toBe(4);
    expect(screen.getByRole("menuitem", { name: "Sign Out" })).toBeTruthy();
    await close();
  });

  test("the complex menu holds items, checkboxes and four submenu rows", async () => {
    render(() => <DropdownMenuComplex />);
    await open("Complex Menu");

    expect(screen.getAllByRole("menuitemcheckbox")).toHaveLength(2);
    expect(
      screen
        .getAllByRole("menuitem")
        .filter((item) => item.getAttribute("aria-haspopup") === "menu")
        .map((item) => item.textContent),
    ).toEqual(["Open Recent", "Theme", "Settings"]);
    expect(checked("menuitemcheckbox", "Show Sidebar")).toBe("true");
    expect(screen.getByRole("menuitem", { name: /Sign Out/ }).getAttribute("data-variant")).toBe(
      "destructive",
    );
    await close();
  });

  test("a menu built from data renders one item per entry", async () => {
    render(() => <DropdownMenuItems />);
    await open("Open");
    expect(screen.getByRole("menu", { name: "Actions" })).toBeTruthy();
    expect(labels("menuitem")).toEqual(["Rename", "Duplicate", "Delete"]);
    expect(screen.getByRole("menuitem", { name: "Delete" }).getAttribute("data-variant")).toBe(
      "destructive",
    );
    await close();
  });

  test("the right-to-left example names its direction on the trigger's element and on the menu", async () => {
    render(() => <DropdownMenuRtl />);
    expect(document.querySelector('[dir="rtl"] [data-slot="button"]')).not.toBeNull();

    await open("افتح القائمة");
    const menu = screen.getByRole("menu");
    expect(menu.getAttribute("dir")).toBe("rtl");
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(4);
    expect(screen.getAllByRole("menuitemcheckbox")).toHaveLength(3);
    await close();
  });
});
