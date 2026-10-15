/**
 * The WAI-ARIA menubar pattern, key by key.
 *
 * What is tested is what makes a row of menus ONE widget: a single Tab stop,
 * arrows that carry the open menu along, and focus that comes back to the
 * trigger it left.
 */

import { describe, expect, test } from "bun:test";
import { createSignal, flush, type Child, type Incoming } from "@barqjs/core";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  tick,
  user,
} from "@barqjs/testing";

import { provideDirection } from "./i18n.ts";
import { Menu, MenuItem, SubmenuTrigger } from "./menu.tsx";
import { Menubar, MenubarMenu, MenubarTrigger } from "./menubar.tsx";

function Bar(
  props: Incoming<{
    loop?: boolean;
    value?: string;
    onValueChange?: (value: string) => void;
    viewDisabled?: boolean;
  }>,
) {
  return (
    <Menubar
      aria-label="Application"
      loop={props.loop?.()}
      value={props.value?.()}
      onValueChange={props.onValueChange?.()}
    >
      <MenubarMenu value="file">
        <MenubarTrigger>File</MenubarTrigger>
        <Menu>
          <MenuItem>New tab</MenuItem>
          <SubmenuTrigger>
            <MenuItem>Share</MenuItem>
            <Menu>
              <MenuItem>Email link</MenuItem>
              <MenuItem>Messages</MenuItem>
            </Menu>
          </SubmenuTrigger>
          <MenuItem>Print</MenuItem>
        </Menu>
      </MenubarMenu>
      <MenubarMenu value="edit">
        <MenubarTrigger>Edit</MenubarTrigger>
        <Menu>
          <MenuItem>Undo</MenuItem>
          <MenuItem>Redo</MenuItem>
        </Menu>
      </MenubarMenu>
      <MenubarMenu value="view">
        <MenubarTrigger isDisabled={props.viewDisabled?.() === true}>View</MenubarTrigger>
        <Menu>
          <MenuItem>Reload</MenuItem>
        </Menu>
      </MenubarMenu>
      <MenubarMenu value="profiles">
        <MenubarTrigger>Profiles</MenubarTrigger>
        <Menu>
          <MenuItem>Add profile</MenuItem>
        </Menu>
      </MenubarMenu>
    </Menubar>
  );
}

/** A menu is PORTALLED, so it is built a microtask after whatever opened it. */
async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

/** Giving focus back to a trigger is deferred to a frame. */
async function frame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  flush();
}

function trigger(name: string): HTMLElement {
  return screen.getByRole("menuitem", { name });
}

function focused(): string | null | undefined {
  return document.activeElement?.textContent;
}

describe("a menubar", () => {
  test("is one named menubar whose triggers are its items", () => {
    const { container } = render(() => <Bar />);

    const bar = screen.getByRole("menubar");
    expect(accessibleName(bar)).toBe("Application");
    expect(bar.getAttribute("data-orientation")).toBe("horizontal");

    const file = trigger("File");
    expect(file.tagName).toBe("BUTTON");
    expect(file.getAttribute("aria-haspopup")).toBe("true");
    expect(file.getAttribute("aria-expanded")).toBe("false");
    expect(file.getAttribute("data-state")).toBe("closed");
    expect(screen.queryByRole("menu")).toBeNull();
    expectNoAriaViolations(container);
  });

  test("is ONE Tab stop, and the stop follows focus", () => {
    render(() => <Bar />);
    const stops = (): string[] =>
      screen
        .getAllByRole("menuitem")
        .filter((item) => item.getAttribute("tabindex") === "0")
        .map((item) => item.textContent ?? "");

    expect(stops()).toEqual(["File"]);

    user.focus(trigger("File"));
    user.keyDown("ArrowRight");
    flush();
    expect(focused()).toBe("Edit");
    expect(stops()).toEqual(["Edit"]);
    expect(trigger("Edit").getAttribute("data-highlighted")).toBe("");
  });

  test("the horizontal arrows walk the triggers and go round", () => {
    render(() => <Bar />);

    user.focus(trigger("File"));
    user.keyDown("ArrowLeft");
    expect(focused()).toBe("Profiles");
    user.keyDown("ArrowRight");
    expect(focused()).toBe("File");
    user.keyDown("ArrowRight");
    user.keyDown("ArrowRight");
    expect(focused()).toBe("View");
    // Nothing opened on the way: with no menu open the arrows only move focus.
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("with loop off the ends are the ends", () => {
    render(() => <Bar loop={false} />);

    user.focus(trigger("File"));
    user.keyDown("ArrowLeft");
    expect(focused()).toBe("File");
    user.keyDown("End");
    user.keyDown("ArrowRight");
    expect(focused()).toBe("Profiles");
  });

  test("Home and End go to the first and last trigger", () => {
    render(() => <Bar />);

    user.focus(trigger("Edit"));
    user.keyDown("End");
    expect(focused()).toBe("Profiles");
    user.keyDown("Home");
    expect(focused()).toBe("File");
  });

  test("typing a letter moves to the trigger that starts with it", () => {
    render(() => <Bar />);

    user.focus(trigger("File"));
    user.keyDown("p");
    expect(focused()).toBe("Profiles");
  });

  test("a disabled trigger is passed over and is never the Tab stop", () => {
    render(() => <Bar viewDisabled />);
    flush();

    expect(trigger("View").getAttribute("tabindex")).toBe("-1");
    user.focus(trigger("Edit"));
    user.keyDown("ArrowRight");
    expect(focused()).toBe("Profiles");
  });

  test("ArrowDown opens the menu on its first item", async () => {
    render(() => <Bar />);

    user.focus(trigger("Edit"));
    user.keyDown("ArrowDown");
    await settle();

    expect(trigger("Edit").getAttribute("aria-expanded")).toBe("true");
    expect(trigger("Edit").getAttribute("data-state")).toBe("open");
    expect(accessibleName(screen.getByRole("menu"))).toBe("Edit");
    expect(focused()).toBe("Undo");
  });

  test("ArrowUp opens it on its last", async () => {
    render(() => <Bar />);

    user.focus(trigger("Edit"));
    user.keyDown("ArrowUp");
    await settle();
    expect(focused()).toBe("Redo");
  });

  test("Enter and Space open it on its first", async () => {
    render(() => <Bar />);

    user.focus(trigger("Edit"));
    user.keyDown("Enter");
    await settle();
    expect(focused()).toBe("Undo");

    user.keyDown("Escape");
    await settle();
    await frame();
    user.focus(trigger("Edit"));
    user.keyDown(" ");
    await settle();
    expect(focused()).toBe("Undo");
  });

  test("a press opens it, and one menu is open at a time", async () => {
    render(() => <Bar />);

    user.click(trigger("File"));
    await settle();
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(accessibleName(screen.getByRole("menu"))).toBe("File");
  });

  test("ArrowRight inside a menu opens the next menu on its first item", async () => {
    render(() => <Bar />);

    user.focus(trigger("Edit"));
    user.keyDown("ArrowDown");
    await settle();
    user.keyDown("ArrowRight");
    await settle();

    // View, then: it is next, and nothing here disabled it.
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(accessibleName(screen.getByRole("menu"))).toBe("View");
    expect(focused()).toBe("Reload");
    expect(trigger("Edit").getAttribute("aria-expanded")).toBe("false");
    expect(trigger("View").getAttribute("aria-expanded")).toBe("true");
    expect(trigger("View").getAttribute("tabindex")).toBe("0");
  });

  test("ArrowLeft inside a menu opens the one before, going round", async () => {
    render(() => <Bar />);

    user.focus(trigger("File"));
    user.keyDown("ArrowDown");
    await settle();
    user.keyDown("ArrowLeft");
    await settle();

    expect(accessibleName(screen.getByRole("menu"))).toBe("Profiles");
    expect(focused()).toBe("Add profile");
  });

  test("on an item with a submenu ArrowRight opens the submenu instead", async () => {
    render(() => <Bar />);

    user.focus(trigger("File"));
    user.keyDown("ArrowDown");
    await settle();
    user.keyDown("ArrowDown");
    expect(focused()).toBe("Share");
    user.keyDown("ArrowRight");
    await settle();

    expect(trigger("File").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menu", { name: "Share" })).not.toBeNull();
    expect(focused()).toBe("Email link");
  });

  test("inside a submenu ArrowLeft closes it and ArrowRight leaves for the next menu", async () => {
    render(() => <Bar />);

    user.focus(trigger("File"));
    user.keyDown("ArrowDown");
    await settle();
    user.keyDown("ArrowDown");
    user.keyDown("ArrowRight");
    await settle();

    user.keyDown("ArrowLeft");
    await settle();
    await frame();
    expect(screen.queryByRole("menu", { name: "Share" })).toBeNull();
    expect(trigger("File").getAttribute("aria-expanded")).toBe("true");
    expect(focused()).toBe("Share");

    user.keyDown("ArrowRight");
    await settle();
    expect(focused()).toBe("Email link");
    user.keyDown("ArrowRight");
    await settle();

    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(accessibleName(screen.getByRole("menu"))).toBe("Edit");
    expect(focused()).toBe("Undo");
  });

  test("coming back to a menu forgets the submenu it had open", async () => {
    render(() => <Bar />);

    user.focus(trigger("File"));
    user.keyDown("ArrowDown");
    await settle();
    user.keyDown("ArrowDown");
    user.keyDown("ArrowRight");
    await settle();
    user.keyDown("ArrowRight");
    await settle();
    user.keyDown("ArrowLeft");
    await settle();

    expect(accessibleName(screen.getAllByRole("menu")[0] as HTMLElement)).toBe("File");
    expect(screen.getAllByRole("menu")).toHaveLength(1);
  });

  test("pointing at another trigger switches menus only while one is open", async () => {
    render(() => <Bar />);

    user.hover(trigger("Edit"));
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();

    user.click(trigger("File"));
    await settle();
    user.hover(trigger("Edit"));
    await settle();

    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(accessibleName(screen.getByRole("menu"))).toBe("Edit");
    expect(trigger("File").getAttribute("aria-expanded")).toBe("false");
  });

  test("Escape closes the menu and focus is back on its trigger", async () => {
    render(() => <Bar />);

    user.focus(trigger("Edit"));
    user.keyDown("ArrowDown");
    await settle();
    user.keyDown("Escape");
    await settle();
    await frame();

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement === trigger("Edit")).toBe(true);
  });

  test("after a switch Escape gives focus to the trigger of the menu that was open", async () => {
    render(() => <Bar />);

    user.focus(trigger("File"));
    user.keyDown("ArrowDown");
    await settle();
    user.keyDown("ArrowLeft");
    await settle();
    // A frame passes between two keypresses, and the menu that closed uses it
    // to see that focus has already gone somewhere.
    await frame();
    user.keyDown("Escape");
    await settle();
    await frame();

    expect(screen.queryByRole("menu")).toBeNull();
    expect(focused()).toBe("Profiles");
    expect(document.activeElement === trigger("Profiles")).toBe(true);
  });

  test("choosing an item closes the menu", async () => {
    render(() => <Bar />);

    user.click(trigger("Edit"));
    await settle();
    user.click(screen.getByRole("menuitem", { name: "Redo" }));
    await settle();

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger("Edit").getAttribute("aria-expanded")).toBe("false");
  });

  test("the bar's value is the open menu, and can be held from outside", async () => {
    const changes: string[] = [];
    const [value, setValue] = createSignal("");
    render(() => (
      <Bar
        value={value()}
        onValueChange={(next) => {
          changes.push(next);
          setValue(next);
        }}
      />
    ));

    user.focus(trigger("Edit"));
    user.keyDown("ArrowDown");
    await settle();
    expect(changes).toEqual(["edit"]);

    setValue("file");
    await settle();
    expect(accessibleName(screen.getByRole("menu"))).toBe("File");

    setValue("");
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("in a right-to-left page the horizontal arrows are the other way round", async () => {
    function Mirrored(props: Incoming<{ children?: Child }>) {
      const directionProps = provideDirection("rtl");
      return <div {...directionProps}>{props.children}</div>;
    }
    render(() => (
      <Mirrored>
        <Bar />
      </Mirrored>
    ));

    user.focus(trigger("File"));
    user.keyDown("ArrowLeft");
    expect(focused()).toBe("Edit");
    user.keyDown("ArrowRight");
    expect(focused()).toBe("File");

    user.keyDown("ArrowDown");
    await settle();
    user.keyDown("ArrowLeft");
    await settle();
    expect(accessibleName(screen.getByRole("menu"))).toBe("Edit");
  });

  test("an open bar passes the aria rules", async () => {
    render(() => <Bar />);

    user.focus(trigger("File"));
    user.keyDown("ArrowDown");
    await settle();
    expectNoAriaViolations(document.body);
  });
});
