import { describe, expect, test } from "bun:test";
import { flush, type Incoming, signal } from "@barqjs/core";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  tick,
  user,
} from "@barqjs/testing";
import type { Key } from "./collections.ts";
import { Menu, MenuButton, MenuItem, MenuSection, MenuTrigger } from "./menu.tsx";

interface Action {
  id: string;
  name: string;
  isDisabled?: boolean;
}

const ACTIONS: Action[] = [
  { id: "cut", name: "Cut" },
  { id: "copy", name: "Copy" },
  { id: "paste", name: "Paste", isDisabled: true },
  { id: "delete", name: "Delete" },
];

function Actions(
  props: Incoming<{
    selectionMode?: "none" | "single" | "multiple";
    onAction?: (key: Key) => void;
    onSelectionChange?: (keys: "all" | Set<Key>) => void;
    onClose?: () => void;
    autoFocus?: boolean | "first" | "last";
  }>,
) {
  return (
    <Menu
      aria-label="Actions"
      items={ACTIONS}
      selectionMode={props.selectionMode?.() ?? "none"}
      autoFocus={props.autoFocus?.()}
      onAction={props.onAction?.()}
      onSelectionChange={props.onSelectionChange?.()}
      onClose={props.onClose?.()}
      getTextValue={(action: Action) => action.name}
    >
      {(action: Action) => <MenuItem>{action.name}</MenuItem>}
    </Menu>
  );
}

function keysOf(selection: "all" | Set<Key>): string[] {
  return selection === "all" ? ["all"] : [...selection].map(String).toSorted();
}

describe("Menu", () => {
  test("is a menu of menuitems with a name", () => {
    render(() => <Actions />);

    const menu = screen.getByRole("menu");
    expect(accessibleName(menu)).toBe("Actions");
    expect(screen.getAllByRole("menuitem")).toHaveLength(4);
  });

  test("an item with nothing to select carries no aria-checked", () => {
    render(() => <Actions />);
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item.hasAttribute("aria-checked")).toBe(false);
    }
  });

  test("single selection makes every item a radio", () => {
    render(() => <Actions selectionMode="single" />);

    const items = screen.getAllByRole("menuitemradio");
    expect(items).toHaveLength(4);
    expect(items[0]?.getAttribute("aria-checked")).toBe("false");
  });

  test("multiple selection makes every item a checkbox", () => {
    render(() => <Actions selectionMode="multiple" />);
    expect(screen.getAllByRole("menuitemcheckbox")).toHaveLength(4);
  });

  test("a click performs the action", () => {
    const actions: Key[] = [];
    render(() => <Actions onAction={(key) => actions.push(key)} />);

    user.click(screen.getByRole("menuitem", { name: "Copy" }));

    expect(actions).toEqual(["copy"]);
  });

  test("a disabled item does nothing", () => {
    const actions: Key[] = [];
    render(() => <Actions onAction={(key) => actions.push(key)} />);

    const paste = screen.getByRole("menuitem", { name: "Paste" });
    expect(paste.getAttribute("aria-disabled")).toBe("true");

    user.click(paste);
    expect(actions).toEqual([]);
  });

  test("a click both selects and acts", () => {
    const actions: Key[] = [];
    const selections: string[][] = [];
    render(() => (
      <Actions
        selectionMode="single"
        onAction={(key) => actions.push(key)}
        onSelectionChange={(keys) => selections.push(keysOf(keys))}
      />
    ));

    user.click(screen.getByRole("menuitemradio", { name: "Copy" }));

    expect(selections).toEqual([["copy"]]);
    expect(actions).toEqual(["copy"]);
  });

  test("choosing closes the menu", () => {
    let closed = 0;
    render(() => <Actions onClose={() => closed++} />);

    user.click(screen.getByRole("menuitem", { name: "Copy" }));

    expect(closed).toBe(1);
  });

  test("a click in a multi-select menu leaves it open", () => {
    let closed = 0;
    render(() => <Actions selectionMode="multiple" onClose={() => closed++} />);

    user.click(screen.getByRole("menuitemcheckbox", { name: "Copy" }));

    expect(closed).toBe(0);
  });

  test("Enter closes a multi-select menu where a click does not", () => {
    let closed = 0;
    const selections: string[][] = [];
    render(() => (
      <Actions
        selectionMode="multiple"
        autoFocus="first"
        onClose={() => closed++}
        onSelectionChange={(keys) => selections.push(keysOf(keys))}
      />
    ));

    user.key("Enter");

    expect(selections).toEqual([["cut"]]);
    expect(closed).toBe(1);
  });

  test("Space checks an item and stays", () => {
    let closed = 0;
    const selections: string[][] = [];
    render(() => (
      <Actions
        selectionMode="multiple"
        autoFocus="first"
        onClose={() => closed++}
        onSelectionChange={(keys) => selections.push(keysOf(keys))}
      />
    ));

    user.key(" ");

    expect(selections).toEqual([["cut"]]);
    expect(closed).toBe(0);
  });

  test("the menu is ONE Tab stop and the arrows skip disabled items", () => {
    render(() => <Actions />);

    const menu = screen.getByRole("menu");
    const items = screen.getAllByRole("menuitem");
    expect(menu.getAttribute("tabindex")).toBe("0");

    user.focus(menu);
    expect(document.activeElement).toBe(items[0] as HTMLElement);

    user.keyDown("ArrowDown");
    expect(document.activeElement).toBe(items[1] as HTMLElement);

    // Paste is disabled, so Down lands on Delete.
    user.keyDown("ArrowDown");
    expect(document.activeElement).toBe(items[3] as HTMLElement);
  });

  test("focus wraps by default, unlike a listbox", () => {
    render(() => <Actions />);

    const menu = screen.getByRole("menu");
    const items = screen.getAllByRole("menuitem");

    user.focus(menu);
    user.keyDown("End");
    user.keyDown("ArrowDown");

    expect(document.activeElement).toBe(items[0] as HTMLElement);
  });

  test("typing jumps to a matching item", () => {
    render(() => <Actions />);

    const menu = screen.getByRole("menu");
    const items = screen.getAllByRole("menuitem");

    user.focus(menu);
    user.keyDown("d");

    expect(document.activeElement).toBe(items[3] as HTMLElement);
  });

  test("Escape is left for the overlay rather than clearing the selection", () => {
    const selections: string[][] = [];
    render(() => (
      <Actions
        selectionMode="multiple"
        autoFocus="first"
        onSelectionChange={(keys) => selections.push(keysOf(keys))}
      />
    ));

    user.key(" ");
    expect(selections).toEqual([["cut"]]);

    user.keyDown("Escape");
    expect(selections).toEqual([["cut"]]);
  });

  test("the items are data, so changing them updates the menu", () => {
    const items = signal<Action[]>([{ id: "a", name: "Cut" }]);
    render(() => (
      <Menu aria-label="Actions" items={items()}>
        {(action: Action) => <MenuItem>{action.name}</MenuItem>}
      </Menu>
    ));

    expect(screen.getAllByRole("menuitem")).toHaveLength(1);

    items.set([
      { id: "a", name: "Cut" },
      { id: "b", name: "Copy" },
    ]);
    flush();

    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Actions selectionMode="single" />);
    expectNoAriaViolations(container);
  });
});

// ---------------------------------------------------------------------------

interface Group {
  id: string;
  name: string;
  children?: Action[];
}

const GROUPED: Group[] = [
  {
    id: "edit",
    name: "Edit",
    children: [
      { id: "cut", name: "Cut" },
      { id: "copy", name: "Copy" },
    ],
  },
  { id: "view", name: "View", children: [{ id: "zoom", name: "Zoom" }] },
];

function Grouped() {
  return (
    <Menu aria-label="Actions" items={GROUPED}>
      {(entry: Group) => (
        <MenuSection heading={entry.name}>
          {(child: Action) => <MenuItem>{child.name}</MenuItem>}
        </MenuSection>
      )}
    </Menu>
  );
}

describe("MenuSection", () => {
  test("groups its items and takes its name from the heading", () => {
    render(() => <Grouped />);

    const groups = screen.getAllByRole("group");
    expect(groups).toHaveLength(2);
    expect(accessibleName(groups[0] as HTMLElement)).toBe("Edit");
    expect(accessibleName(groups[1] as HTMLElement)).toBe("View");
  });

  test("the heading is not itself an item", () => {
    render(() => <Grouped />);
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
  });

  test("the arrows walk across the section boundary", () => {
    render(() => <Grouped />);

    const menu = screen.getByRole("menu");
    const items = screen.getAllByRole("menuitem");

    user.focus(menu);
    user.keyDown("ArrowDown");
    user.keyDown("ArrowDown");

    expect(document.activeElement).toBe(items[2] as HTMLElement);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Grouped />);
    expectNoAriaViolations(container);
  });
});

// ---------------------------------------------------------------------------

function Trigger(props: Incoming<{ onAction?: (key: Key) => void }>) {
  return (
    <MenuTrigger>
      <MenuButton>Actions</MenuButton>
      <Menu aria-label="Actions" items={ACTIONS} onAction={props.onAction?.()}>
        {(action: Action) => <MenuItem>{action.name}</MenuItem>}
      </Menu>
    </MenuTrigger>
  );
}

describe("MenuTrigger", () => {
  test("the button says it opens a menu and is collapsed", () => {
    render(() => <Trigger />);

    const button = screen.getByRole("button", { name: "Actions" });
    expect(button.getAttribute("aria-haspopup")).toBe("true");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("a press opens it", async () => {
    render(() => <Trigger />);

    user.click(screen.getByRole("button", { name: "Actions" }));
    await tick();

    expect(screen.getByRole("menu")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Actions" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  test("the menu is named by the button", async () => {
    render(() => <Trigger />);

    user.click(screen.getByRole("button", { name: "Actions" }));
    await tick();

    expect(accessibleName(screen.getByRole("menu"))).toBe("Actions");
  });

  test("ArrowDown opens with the first item focused", async () => {
    render(() => <Trigger />);

    user.focus(screen.getByRole("button", { name: "Actions" }));
    user.keyDown("ArrowDown");
    await tick();

    expect(document.activeElement?.textContent).toBe("Cut");
  });

  test("ArrowUp opens with the last item focused", async () => {
    render(() => <Trigger />);

    user.focus(screen.getByRole("button", { name: "Actions" }));
    user.keyDown("ArrowUp");
    await tick();

    expect(document.activeElement?.textContent).toBe("Delete");
  });

  test("choosing an item acts and closes", async () => {
    const actions: Key[] = [];
    render(() => <Trigger onAction={(key) => actions.push(key)} />);

    user.click(screen.getByRole("button", { name: "Actions" }));
    await tick();

    user.click(screen.getByRole("menuitem", { name: "Copy" }));

    expect(actions).toEqual(["copy"]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("Escape closes it", async () => {
    render(() => <Trigger />);

    user.click(screen.getByRole("button", { name: "Actions" }));
    await tick();

    user.keyDown("Escape");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("two triggers side by side keep their own menus", async () => {
    render(() => (
      <>
        <MenuTrigger>
          <MenuButton>File</MenuButton>
          <Menu aria-label="File" items={[{ id: "open", name: "Open" }]}>
            {(a: Action) => <MenuItem>{a.name}</MenuItem>}
          </Menu>
        </MenuTrigger>
        <MenuTrigger>
          <MenuButton>Edit</MenuButton>
          <Menu aria-label="Edit" items={[{ id: "undo", name: "Undo" }]}>
            {(a: Action) => <MenuItem>{a.name}</MenuItem>}
          </Menu>
        </MenuTrigger>
      </>
    ));

    user.click(screen.getByRole("button", { name: "File" }));
    await tick();

    const menus = screen.getAllByRole("menu");
    expect(menus).toHaveLength(1);
    expect(accessibleName(menus[0] as HTMLElement)).toBe("File");
    expect(screen.getByRole("menuitem").textContent).toBe("Open");
  });

  test("has no ARIA violations while open", async () => {
    const { container } = render(() => <Trigger />);

    user.click(screen.getByRole("button", { name: "Actions" }));
    await tick();

    expectNoAriaViolations(container);
  });
});
