/**
 * Submenus: a menu item that opens a menu beside itself.
 *
 * The tests that matter are the ones about the STACK. Only one submenu can be
 * open at a given depth, and opening one has to close whatever was open below
 * it — which is a rule about a tree, not about any one trigger.
 */

import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import { expectNoAriaViolations, render, screen, tick, user, within } from "@barqjs/testing";
import type { Key } from "./collections.ts";
import { Menu, MenuButton, MenuItem, MenuTrigger, SubmenuTrigger } from "./menu.tsx";

interface Action {
  id: string;
  name: string;
  /** NOT `children`: the collection reads that as a section's items. */
  submenu?: Action[];
}

const SHARE: Action[] = [{ id: "email", name: "Email" }];

const MORE: Action[] = [
  { id: "print", name: "Print" },
  { id: "fax", name: "Fax" },
];

const ACTIONS: Action[] = [
  { id: "cut", name: "Cut" },
  { id: "share", name: "Share", submenu: SHARE },
  { id: "more", name: "More", submenu: MORE },
  { id: "delete", name: "Delete" },
];

function Actions(props: Incoming<{ onAction?: (key: Key) => void }>) {
  return (
    <MenuTrigger>
      <MenuButton>Edit</MenuButton>
      <Menu
        aria-label="Actions"
        items={ACTIONS}
        onAction={props.onAction?.()}
        getTextValue={(action: Action) => action.name}
      >
        {(action: Action) =>
          action.submenu === undefined ? (
            <MenuItem>{action.name}</MenuItem>
          ) : (
            <SubmenuTrigger>
              <MenuItem>{action.name}</MenuItem>
              <Menu
                items={action.submenu}
                onAction={props.onAction?.()}
                getTextValue={(child: Action) => child.name}
              >
                {(child: Action) => <MenuItem>{child.name}</MenuItem>}
              </Menu>
            </SubmenuTrigger>
          )
        }
      </Menu>
    </MenuTrigger>
  );
}

/** The menu is PORTALLED, so it is built a microtask after the press. */
async function open(): Promise<void> {
  user.click(screen.getByRole("button", { name: "Edit" }));
  flush();
  await tick();
  flush();
}

/** Focus restoration on close is deferred to a frame. */
function frame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/** So is a submenu. */
async function openSubmenu(name: string): Promise<void> {
  user.focus(item(name));
  flush();
  await tick();
  flush();
  user.focus(item(name));
  user.key("ArrowRight");
  flush();
  await tick();
  flush();
}

function item(name: string): HTMLElement {
  return screen.getByRole("menuitem", { name });
}

describe("a submenu trigger", () => {
  test("says what it opens, and that it is closed", async () => {
    render(() => <Actions />);
    await open();

    const share = item("Share");
    expect(share.getAttribute("aria-haspopup")).toBe("menu");
    expect(share.getAttribute("aria-expanded")).toBe("false");
    expect(share.hasAttribute("aria-controls")).toBe(false);
  });

  test("an ordinary item says none of it", async () => {
    render(() => <Actions />);
    await open();

    expect(item("Cut").hasAttribute("aria-haspopup")).toBe(false);
    expect(item("Cut").hasAttribute("aria-expanded")).toBe(false);
  });

  test("ArrowRight opens it and names it from the item", async () => {
    render(() => <Actions />);
    await open();

    await openSubmenu("Share");

    const share = item("Share");
    expect(share.getAttribute("aria-expanded")).toBe("true");

    const submenu = screen.getByRole("menu", { name: "Share" });
    expect(share.getAttribute("aria-controls")).toBe(submenu.id);
    expect(submenu.getAttribute("aria-labelledby")).toBe(share.id);
  });

  test("ArrowLeft closes it and puts focus back on the trigger", async () => {
    render(() => <Actions />);
    await open();

    await openSubmenu("Share");
    expect(screen.queryByRole("menu", { name: "Share" })).not.toBeNull();

    const inside = within(screen.getByRole("menu", { name: "Share" })).getByRole("menuitem", {
      name: "Email",
    });
    user.focus(inside);
    user.key("ArrowLeft");
    await tick();
    flush();
    await frame();

    expect(screen.queryByRole("menu", { name: "Share" })).toBeNull();
    expect(document.activeElement?.textContent).toBe("Share");
    expect((document.activeElement as HTMLElement | null)?.tagName).toBe("LI");
  });

  test("Escape inside closes the submenu, not the whole tree", async () => {
    render(() => <Actions />);
    await open();

    await openSubmenu("Share");

    const inside = within(screen.getByRole("menu", { name: "Share" })).getByRole("menuitem", {
      name: "Email",
    });
    user.focus(inside);
    user.key("Escape");
    await tick();
    flush();

    expect(screen.queryByRole("menu", { name: "Share" })).toBeNull();
    expect(screen.queryByRole("menu", { name: "Actions" })).not.toBeNull();
  });

  test("opening a second submenu closes the first", async () => {
    render(() => <Actions />);
    await open();

    await openSubmenu("Share");
    expect(screen.queryByRole("menu", { name: "Share" })).not.toBeNull();

    await openSubmenu("More");

    expect(screen.queryByRole("menu", { name: "Share" })).toBeNull();
    expect(screen.queryByRole("menu", { name: "More" })).not.toBeNull();
  });

  test("moving focus to another item of the parent closes the submenu", async () => {
    render(() => <Actions />);
    await open();

    await openSubmenu("Share");
    expect(screen.queryByRole("menu", { name: "Share" })).not.toBeNull();

    user.focus(item("Cut"));
    await tick();
    flush();

    expect(screen.queryByRole("menu", { name: "Share" })).toBeNull();
  });

  test("choosing inside the submenu closes the whole tree", async () => {
    const acted: Key[] = [];
    render(() => <Actions onAction={(key) => acted.push(key)} />);
    await open();

    await openSubmenu("Share");

    const inside = within(screen.getByRole("menu", { name: "Share" })).getByRole("menuitem", {
      name: "Email",
    });
    user.click(inside);
    await tick();
    flush();

    expect(acted).toEqual(["email"]);
    expect(screen.queryByRole("menu", { name: "Actions" })).toBeNull();
  });

  test("Escape closes the innermost menu first, then the root", async () => {
    render(() => <Actions />);
    await open();
    await openSubmenu("Share");

    user.key("Escape");
    flush();
    await tick();
    flush();
    await frame();

    expect(screen.queryByRole("menu", { name: "Share" })).toBeNull();
    expect(screen.queryByRole("menu", { name: "Actions" })).not.toBeNull();

    user.key("Escape");
    flush();
    await tick();
    flush();
    await frame();

    expect(screen.queryByRole("menu", { name: "Actions" })).toBeNull();
  });

  test("reopening the root menu forgets every submenu that was open", async () => {
    render(() => <Actions />);
    await open();
    await openSubmenu("Share");

    // Twice: the first Escape belongs to the submenu, the second to the root.
    user.key("Escape");
    flush();
    await tick();
    flush();
    await frame();
    user.key("Escape");
    flush();
    await tick();
    flush();
    await frame();
    expect(screen.queryByRole("menu", { name: "Actions" })).toBeNull();

    await open();

    expect(screen.queryByRole("menu", { name: "Share" })).toBeNull();
    expect(item("Share").getAttribute("aria-expanded")).toBe("false");
  });

  test("the whole tree passes the aria rules", async () => {
    render(() => <Actions />);
    await open();

    await openSubmenu("Share");

    expectNoAriaViolations(document.body);
  });
});
