/**
 * A menu opened at the pointer.
 *
 * The tests that matter are about the ANCHOR. Every other menu here hangs off
 * an element that has a box; this one hangs off a point, and the point is the
 * only thing about it that no other menu already covers.
 */

import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import { expectNoAriaViolations, render, screen, tick, user } from "@barqjs/testing";
import type { Key } from "./collections.ts";
import { ContextMenu, ContextMenuTrigger, Menu, MenuItem } from "./menu.tsx";

interface Action {
  id: string;
  name: string;
}

const ACTIONS: Action[] = [
  { id: "back", name: "Back" },
  { id: "reload", name: "Reload" },
  { id: "save", name: "Save as" },
];

function Region(props: Incoming<{ onAction?: (key: Key) => void; isDisabled?: boolean }>) {
  return (
    <ContextMenu isDisabled={props.isDisabled?.()} longPressThreshold={10}>
      <ContextMenuTrigger>
        <button type="button">Inside</button>
      </ContextMenuTrigger>
      <Menu
        aria-label="Page"
        items={ACTIONS}
        onAction={props.onAction?.()}
        getTextValue={(action: Action) => action.name}
      >
        {(action: Action) => <MenuItem>{action.name}</MenuItem>}
      </Menu>
    </ContextMenu>
  );
}

/** The menu is PORTALLED, so it is built a microtask after the event. */
async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

function region(): HTMLElement {
  return screen.getByRole("button", { name: "Inside" }).parentElement as HTMLElement;
}

/** The popover, which is what carries the position. */
function panel(): HTMLElement {
  return screen.getByRole("menu").parentElement as HTMLElement;
}

function at(element: HTMLElement): { left: string; top: string } {
  return { left: element.style.left, top: element.style.top };
}

describe("a context menu", () => {
  test("opens where the pointer was, not where the region is", async () => {
    render(() => <Region />);
    user.rightClick(region(), { clientX: 120, clientY: 80 });
    await settle();

    expect(screen.getByRole("menu")).toBeTruthy();
    // "right top" against a zero-size box: two pixels to the right of the
    // pointer, its top edge on it.
    expect(at(panel())).toEqual({ left: "122px", top: "80px" });
  });

  test("moves to the second point rather than staying at the first", async () => {
    render(() => <Region />);
    user.rightClick(region(), { clientX: 120, clientY: 80 });
    await settle();
    user.rightClick(region(), { clientX: 300, clientY: 200 });
    await settle();

    expect(at(panel())).toEqual({ left: "302px", top: "200px" });
  });

  test("takes the browser's own menu away", async () => {
    render(() => <Region />);
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    region().dispatchEvent(event);
    await settle();

    expect(event.defaultPrevented).toBe(true);
  });

  test("leaves it alone when disabled, and does not open", async () => {
    render(() => <Region isDisabled />);
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    region().dispatchEvent(event);
    await settle();

    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("chooses an item", async () => {
    const chosen: Key[] = [];
    render(() => <Region onAction={(key) => chosen.push(key)} />);
    user.rightClick(region(), { clientX: 10, clientY: 10 });
    await settle();

    user.click(screen.getByRole("menuitem", { name: "Reload" }));
    await settle();

    expect(chosen).toEqual(["reload"]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("Escape closes it", async () => {
    render(() => <Region />);
    user.rightClick(region(), { clientX: 10, clientY: 10 });
    await settle();

    user.key("Escape", { target: screen.getByRole("menu") });
    await settle();

    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("names nothing after the region it covers", async () => {
    render(() => <Region />);
    user.rightClick(region(), { clientX: 10, clientY: 10 });
    await settle();

    // A region is a page of content, and `aria-labelledby` pointed at it would
    // read the whole of it out as the menu's name.
    expect(screen.getByRole("menu").hasAttribute("aria-labelledby")).toBe(false);
    expect(screen.getByRole("menu").getAttribute("aria-label")).toBe("Page");
  });

  test("has no violations open", async () => {
    render(() => <Region />);
    user.rightClick(region(), { clientX: 10, clientY: 10 });
    await settle();

    expectNoAriaViolations(document.body);
  });
});

describe("opened from the keyboard", () => {
  test("Shift+F10 opens it on the first item", async () => {
    render(() => <Region />);
    const inside = screen.getByRole("button", { name: "Inside" });
    user.key("F10", { shiftKey: true, target: inside });
    await settle();

    expect(screen.getByRole("menu")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Back" }));
  });

  test("the Menu key does too", async () => {
    render(() => <Region />);
    user.key("ContextMenu", { target: screen.getByRole("button", { name: "Inside" }) });
    await settle();

    expect(screen.getByRole("menu")).toBeTruthy();
  });

  test("a contextmenu event with no button behind it lands on the first item", async () => {
    render(() => <Region />);
    // What Shift+F10 produces in a browser that turns it into a `contextmenu`
    // rather than leaving the keydown alone: no button, none held.
    region().dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 0 }),
    );
    await settle();

    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Back" }));
  });

  test("a right-click does not", async () => {
    render(() => <Region />);
    user.rightClick(region(), { clientX: 10, clientY: 10 });
    await settle();

    expect(document.activeElement).toBe(screen.getByRole("menu"));
  });
});

describe("held on a touch screen", () => {
  test("opens at the finger", async () => {
    render(() => <Region />);
    user.pointerDown(region(), { pointerType: "touch", clientX: 40, clientY: 60 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    await settle();

    expect(screen.getByRole("menu")).toBeTruthy();
    expect(at(panel())).toEqual({ left: "42px", top: "60px" });
  });

  test("a hold that turns into a scroll opens nothing", async () => {
    render(() => <Region />);
    user.pointerDown(region(), { pointerType: "touch", clientX: 40, clientY: 60 });
    user.pointerMove(region(), { pointerType: "touch", clientX: 40, clientY: 140 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    await settle();

    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("a tap opens nothing", async () => {
    render(() => <Region />);
    user.pointerDown(region(), { pointerType: "touch", clientX: 40, clientY: 60 });
    user.pointerUp(region(), { pointerType: "touch", clientX: 40, clientY: 60 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    await settle();

    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("a mouse press does not wait to open one", async () => {
    render(() => <Region />);
    user.pointerDown(region(), { clientX: 40, clientY: 60 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    await settle();

    expect(screen.queryByRole("menu")).toBeNull();
  });
});
