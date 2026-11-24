import { describe, expect, test } from "bun:test";
import { flush, provide, Show, createSignal, type ParentProps } from "@barqjs/core";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  tick,
  user,
} from "@barqjs/testing";
import { ref as makeRef, mergeRefs } from "@barqjs/primitives/refs";
import { Autocomplete, type AutocompleteFilter, useAutocompleteInput } from "./autocomplete.tsx";
import { listState, type Key, type ListState } from "./collections.ts";
import { RouterContext } from "./interactions/open-link.ts";
import { searchField } from "./textfield.tsx";
import { mergeProps } from "./utils.ts";
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuRadioGroup,
  MenuSection,
  MenuTrigger,
  menuItem,
  useMenuGroupHeading,
  type MenuSelectEvent,
} from "./menu.tsx";
import { SelectionIndicator } from "./selection-indicator.tsx";

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

interface ActionsProps {
  selectionMode?: "none" | "single" | "multiple";
  onAction?: (key: Key) => void;
  onSelectionChange?: (keys: "all" | Set<Key>) => void;
  onClose?: () => void;
  autoFocus?: boolean | "first" | "last";
}

function Actions(props: ActionsProps) {
  return (
    <Menu
      aria-label="Actions"
      items={ACTIONS}
      selectionMode={props.selectionMode ?? "none"}
      autoFocus={props.autoFocus}
      onAction={props.onAction}
      onSelectionChange={props.onSelectionChange}
      onClose={props.onClose}
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
    const [items, setItems] = createSignal<Action[]>([{ id: "a", name: "Cut" }]);
    render(() => (
      <Menu aria-label="Actions" items={items()}>
        {(action: Action) => <MenuItem>{action.name}</MenuItem>}
      </Menu>
    ));

    expect(screen.getAllByRole("menuitem")).toHaveLength(1);

    setItems([
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

describe("an item's focus events", () => {
  // A menu here moves REAL DOM focus through its items rather than a virtual
  // highlight, so `onFocus` on an item is what tells a caller which one the
  // keyboard is on. `filterDOMProps` dropped it, which left the pointer as the
  // only observable way through a menu: shadcn's `/create` previews the
  // hovered value and browsing with the arrow keys previewed nothing.
  test("reach the caller", async () => {
    const focused: string[] = [];

    render(() => (
      <Menu aria-label="Actions" items={ACTIONS} getTextValue={(action: Action) => action.name}>
        {(action: Action) => (
          <MenuItem onFocus={() => focused.push(action.name)}>{action.name}</MenuItem>
        )}
      </Menu>
    ));

    const items = screen.getAllByRole("menuitem");
    (items[1] as HTMLElement).focus();
    await tick();

    expect(focused).toEqual(["Copy"]);
  });
});

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

interface TriggerProps {
  onAction?: (key: Key) => void;
}

// ---------------------------------------------------------------------------

function Trigger(props: TriggerProps) {
  return (
    <MenuTrigger>
      <MenuButton>Actions</MenuButton>
      <Menu aria-label="Actions" items={ACTIONS} onAction={props.onAction}>
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

interface WrittenProps {
  onAction?: (key: Key) => void;
  onRename?: () => void;
  onSelect?: (event: MenuSelectEvent) => void;
  onClose?: () => void;
  showCopy?: boolean;
}

interface ViewProps {
  onToolbar?: (isSelected: boolean) => void;
  onDensity?: (value: string) => void;
  onClose?: () => void;
}

interface LinkWatch {
  followed: FollowedLink[];
  stop: () => void;
}

interface FollowedLink {
  href: string;
  ctrlKey: boolean;
}

interface LinksProps {
  onClose?: () => void;
  onAction?: (key: Key) => void;
}

interface Named {
  name: string;
}

/**
 * The same menu with its items WRITTEN rather than rendered from data. Each
 * one says what it is, and the collection is whatever rendered.
 */
describe("a menu whose items are its children", () => {
  function Written(props: WrittenProps) {
    return (
      <Menu aria-label="Actions" onAction={props.onAction} onClose={props.onClose}>
        <MenuItem id="rename" onAction={props.onRename} onSelect={props.onSelect}>
          Rename
        </MenuItem>
        <Show when={props.showCopy !== false}>
          <MenuItem id="copy">Copy</MenuItem>
        </Show>
        <MenuItem id="paste" isDisabled>
          Paste
        </MenuItem>
        <MenuItem id="delete">Delete</MenuItem>
      </Menu>
    );
  }

  test("is the same menu: named, with one menuitem per child", () => {
    const { container } = render(() => <Written />);
    flush();

    expect(accessibleName(screen.getByRole("menu"))).toBe("Actions");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Rename",
      "Copy",
      "Paste",
      "Delete",
    ]);
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item.hasAttribute("aria-checked")).toBe(false);
    }
    expectNoAriaViolations(container);
  });

  test("the arrows walk the written items, skip a disabled one and wrap", () => {
    render(() => <Written />);
    flush();
    const items = screen.getAllByRole("menuitem");

    user.focus(screen.getByRole("menu"));
    expect(document.activeElement).toBe(items[0] as HTMLElement);
    user.keyDown("ArrowDown");
    expect(document.activeElement).toBe(items[1] as HTMLElement);
    user.keyDown("ArrowDown");
    expect(document.activeElement).toBe(items[3] as HTMLElement);
    expect(items[2]?.getAttribute("aria-disabled")).toBe("true");
    expect(items[2]?.getAttribute("data-disabled")).toBe("");
    user.keyDown("ArrowDown");
    expect(document.activeElement).toBe(items[0] as HTMLElement);
    expect(items[0]?.getAttribute("data-highlighted")).toBe("");
  });

  test("Home, End and typing a letter find the written items", () => {
    render(() => <Written />);
    flush();

    user.focus(screen.getByRole("menu"));
    user.keyDown("End");
    expect(document.activeElement?.textContent).toBe("Delete");
    user.keyDown("Home");
    expect(document.activeElement?.textContent).toBe("Rename");
    user.keyDown("c");
    expect(document.activeElement?.textContent).toBe("Copy");
  });

  test("choosing one runs its own action, reports its key and closes", () => {
    const keys: Key[] = [];
    let renamed = 0;
    let closed = 0;
    render(() => (
      <Written
        onAction={(key) => keys.push(key)}
        onRename={() => renamed++}
        onClose={() => closed++}
      />
    ));
    flush();

    user.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(renamed).toBe(1);
    expect(keys).toEqual(["rename"]);
    expect(closed).toBe(1);
  });

  test("a disabled written item does nothing", () => {
    const keys: Key[] = [];
    render(() => <Written onAction={(key) => keys.push(key)} />);
    flush();

    user.click(screen.getByRole("menuitem", { name: "Paste" }));
    expect(keys).toEqual([]);
  });

  test("an item's onSelect can keep the menu open", () => {
    let closed = 0;
    const seen: Key[] = [];
    render(() => (
      <Written
        onClose={() => closed++}
        onSelect={(event) => {
          seen.push(event.key);
          event.preventDefault();
        }}
      />
    ));
    flush();

    user.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(seen).toEqual(["rename"]);
    expect(closed).toBe(0);
  });

  test("an item a <Show> takes away leaves the keyboard's path", () => {
    const [copy, setCopy] = createSignal(true);
    render(() => <Written showCopy={copy()} />);
    flush();

    setCopy(false);
    flush();
    user.focus(screen.getByRole("menu"));
    user.keyDown("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Delete");
  });

  test("the element's id is derived from the key, not taken from it", () => {
    render(() => <Written />);
    flush();

    const rename = screen.getByRole("menuitem", { name: "Rename" });
    expect(rename.id).not.toBe("rename");
    expect(rename.id.endsWith("-item-rename")).toBe(true);
  });

  function View(props: ViewProps) {
    const [density, setDensity] = createSignal("compact");
    return (
      <Menu aria-label="View" onClose={props.onClose}>
        <MenuItem defaultSelected onChange={props.onToolbar}>
          Toolbar
        </MenuItem>
        <MenuItem type="checkbox">Status bar</MenuItem>
        <MenuRadioGroup
          aria-label="Density"
          value={density()}
          onValueChange={(value) => {
            setDensity(value);
            props.onDensity?.(value);
          }}
        >
          <MenuItem value="compact">Compact</MenuItem>
          <MenuItem value="comfortable">Comfortable</MenuItem>
        </MenuRadioGroup>
        <MenuItem>Print</MenuItem>
      </Menu>
    );
  }

  test("one written menu mixes checkboxes, radios and plain items", () => {
    const { container } = render(() => <View />);
    flush();

    expect(screen.getAllByRole("menuitemcheckbox").map((item) => item.textContent)).toEqual([
      "Toolbar",
      "Status bar",
    ]);
    expect(screen.getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual([
      "Compact",
      "Comfortable",
    ]);
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Print"]);
    expect(accessibleName(screen.getByRole("group"))).toBe("Density");
    expectNoAriaViolations(container);
  });

  test("a checkbox item holds its own tick and says so both ways", () => {
    const changes: boolean[] = [];
    render(() => <View onToolbar={(isSelected) => changes.push(isSelected)} />);
    flush();

    const toolbar = screen.getByRole("menuitemcheckbox", { name: "Toolbar" });
    const status = screen.getByRole("menuitemcheckbox", { name: "Status bar" });
    expect(toolbar.getAttribute("aria-checked")).toBe("true");
    expect(toolbar.getAttribute("data-state")).toBe("checked");
    expect(toolbar.getAttribute("data-selected")).toBe("");
    expect(status.getAttribute("aria-checked")).toBe("false");
    expect(status.getAttribute("data-state")).toBe("unchecked");

    user.click(toolbar);
    flush();
    expect(changes).toEqual([false]);
    expect(toolbar.getAttribute("aria-checked")).toBe("false");
    expect(toolbar.getAttribute("data-state")).toBe("unchecked");
  });

  test("Space ticks a checkbox item and stays; Enter ticks it and closes", () => {
    let closed = 0;
    render(() => <View onClose={() => closed++} />);
    flush();

    user.focus(screen.getByRole("menu"));
    user.keyDown("ArrowDown");
    user.key(" ");
    flush();
    const status = screen.getByRole("menuitemcheckbox", { name: "Status bar" });
    expect(status.getAttribute("aria-checked")).toBe("true");
    expect(closed).toBe(0);

    user.key("Enter");
    flush();
    expect(status.getAttribute("aria-checked")).toBe("false");
    expect(closed).toBe(1);
  });

  test("a radio group holds the value and one radio is on", () => {
    const values: string[] = [];
    render(() => <View onDensity={(value) => values.push(value)} />);
    flush();

    const compact = screen.getByRole("menuitemradio", { name: "Compact" });
    const comfortable = screen.getByRole("menuitemradio", { name: "Comfortable" });
    expect(compact.getAttribute("aria-checked")).toBe("true");
    expect(comfortable.getAttribute("data-state")).toBe("unchecked");

    user.click(comfortable);
    flush();
    expect(values).toEqual(["comfortable"]);
    expect(compact.getAttribute("aria-checked")).toBe("false");
    expect(comfortable.getAttribute("aria-checked")).toBe("true");
    expect(comfortable.getAttribute("data-state")).toBe("checked");
  });

  test("the arrows cross a group's boundary as though it were not there", () => {
    render(() => <View />);
    flush();

    user.focus(screen.getByRole("menu"));
    user.keyDown("ArrowDown");
    user.keyDown("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Compact");
    user.keyDown("ArrowDown");
    user.keyDown("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Print");
  });

  function Heading(props: ParentProps) {
    const headingId = useMenuGroupHeading();
    return (
      <li role="presentation" id={headingId?.()}>
        {props.children}
      </li>
    );
  }

  test("a written section is a group named by a heading written inside it", () => {
    const { container } = render(() => (
      <Menu aria-label="Actions">
        <MenuSection heading="Edit">
          <MenuItem>Cut</MenuItem>
        </MenuSection>
        <MenuSection>
          <Heading>View</Heading>
          <MenuItem>Zoom</MenuItem>
        </MenuSection>
      </Menu>
    ));
    flush();

    expect(screen.getAllByRole("group").map((group) => accessibleName(group))).toEqual([
      "Edit",
      "View",
    ]);
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expectNoAriaViolations(container);
  });

  /** Every click on an anchor that nothing cancelled: what the browser would follow. */
  function watchLinks(): LinkWatch {
    const followed: FollowedLink[] = [];
    function record(event: MouseEvent): void {
      const anchor = (event.target as Element).closest("a");
      if (anchor === null) return;
      queueMicrotask(() => {
        if (event.defaultPrevented) return;
        followed.push({ href: anchor.getAttribute("href") ?? "", ctrlKey: event.ctrlKey });
      });
    }
    document.addEventListener("click", record, true);
    return { followed, stop: () => document.removeEventListener("click", record, true) };
  }

  function Links(props: LinksProps) {
    return (
      <Menu aria-label="Go" onClose={props.onClose} onAction={props.onAction}>
        <MenuItem id="docs" href="#docs">
          Documentation
        </MenuItem>
        <MenuItem id="billing" href="#billing" target="_blank" rel="noreferrer" isDisabled>
          Billing
        </MenuItem>
        <MenuItem id="sign-out">Sign out</MenuItem>
      </Menu>
    );
  }

  test("a written item with an href is a real link that is still a menu item", () => {
    const { container } = render(() => <Links />);
    flush();

    const link = screen.getByRole("menuitem", { name: "Documentation" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("#docs");
    expect(link.parentElement?.tagName).toBe("LI");
    expect(link.parentElement?.getAttribute("role")).toBe("none");
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
    expectNoAriaViolations(container);
  });

  test("the arrows reach a link item like any other", () => {
    render(() => <Links />);
    flush();

    user.focus(screen.getByRole("menu"));
    expect(document.activeElement?.textContent).toBe("Documentation");
    user.keyDown("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Sign out");
  });

  test("a press follows the link, reports the item and closes the menu", async () => {
    let closed = 0;
    const keys: Key[] = [];
    render(() => <Links onClose={() => closed++} onAction={(key) => keys.push(key)} />);
    flush();

    const links = watchLinks();
    user.click(screen.getByRole("menuitem", { name: "Documentation" }));
    await tick();
    links.stop();

    // Once: the press follows it, and the click that carried the press does not.
    expect(links.followed).toEqual([{ href: "#docs", ctrlKey: false }]);
    expect(keys).toEqual(["docs"]);
    expect(closed).toBe(1);
  });

  test("a click with a modifier held reaches the browser with the modifier", async () => {
    render(() => <Links />);
    flush();

    const links = watchLinks();
    user.click(screen.getByRole("menuitem", { name: "Documentation" }), { ctrlKey: true });
    await tick();
    links.stop();
    expect(links.followed).toEqual([{ href: "#docs", ctrlKey: true }]);
  });

  test("Enter follows a link item and closes the menu", async () => {
    let closed = 0;
    render(() => <Links onClose={() => closed++} />);
    flush();

    user.focus(screen.getByRole("menu"));
    const links = watchLinks();
    user.key("Enter");
    await tick();
    links.stop();
    expect(links.followed).toEqual([{ href: "#docs", ctrlKey: false }]);
    expect(closed).toBe(1);
  });

  test("Space follows it too, once", async () => {
    render(() => <Links />);
    flush();

    user.focus(screen.getByRole("menu"));
    const links = watchLinks();
    user.key(" ");
    await tick();
    links.stop();
    expect(links.followed).toEqual([{ href: "#docs", ctrlKey: false }]);
  });

  test("a disabled link item has nothing to follow and does nothing", async () => {
    let closed = 0;
    const keys: Key[] = [];
    render(() => <Links onClose={() => closed++} onAction={(key) => keys.push(key)} />);
    flush();

    const billing = screen.getByRole("menuitem", { name: "Billing" });
    expect(billing.tagName).toBe("A");
    expect(billing.hasAttribute("href")).toBe(false);
    expect(billing.getAttribute("target")).toBe("_blank");
    expect(billing.getAttribute("rel")).toBe("noreferrer");
    expect(billing.getAttribute("aria-disabled")).toBe("true");

    const links = watchLinks();
    user.click(billing);
    await tick();
    links.stop();
    expect(links.followed).toEqual([]);
    expect(keys).toEqual([]);
    expect(closed).toBe(0);
  });

  test("a client router takes the navigation instead of the browser", async () => {
    const opened: string[] = [];
    function Routed() {
      return provide(
        RouterContext,
        () => ({
          isNative: false,
          open: (_target: Element, _modifiers: object, href: string) => opened.push(href),
          href: (href: string) => `/app${href}`,
        }),
        () => (
          <Menu aria-label="Go">
            <MenuItem href="/settings">Settings</MenuItem>
          </Menu>
        ),
      ) as never;
    }
    render(() => <Routed />);
    flush();

    const link = screen.getByRole("menuitem", { name: "Settings" });
    expect(link.getAttribute("href")).toBe("/app/settings");

    const links = watchLinks();
    user.click(link);
    await tick();
    links.stop();
    expect(opened).toEqual(["/settings"]);
    expect(links.followed).toEqual([]);
  });

  test("an item rendered from data with an href is the same link", async () => {
    let closed = 0;
    render(() => (
      <Menu
        aria-label="Go"
        items={[
          { id: "docs", name: "Documentation", href: "#docs" },
          { id: "out", name: "Sign out" },
        ]}
        onClose={() => closed++}
      >
        {(entry: Named) => <MenuItem>{entry.name}</MenuItem>}
      </Menu>
    ));
    flush();

    const link = screen.getByRole("menuitem", { name: "Documentation" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("#docs");
    expect(screen.getByRole("menuitem", { name: "Sign out" }).tagName).toBe("LI");

    const links = watchLinks();
    user.click(link);
    await tick();
    links.stop();
    expect(links.followed).toEqual([{ href: "#docs", ctrlKey: false }]);
    expect(closed).toBe(1);
  });

  test("opened from a trigger it lands on the first written item", async () => {
    render(() => (
      <MenuTrigger>
        <MenuButton>Actions</MenuButton>
        <Menu>
          <MenuItem>Cut</MenuItem>
          <MenuItem>Copy</MenuItem>
        </Menu>
      </MenuTrigger>
    ));

    const button = screen.getByRole("button", { name: "Actions" });
    expect(button.getAttribute("data-state")).toBe("closed");
    user.focus(button);
    user.keyDown("ArrowDown");
    await tick();
    flush();

    expect(button.getAttribute("data-state")).toBe("open");
    expect(document.activeElement?.textContent).toBe("Cut");
    const menu = screen.getByRole("menu");
    expect(menu.getAttribute("data-state")).toBe("open");
    expect(menu.getAttribute("data-side")).toBe("bottom");
    expect(menu.getAttribute("data-align")).toBe("start");
  });
});

interface ItemProps {
  state: ListState<unknown>;
}

describe("what the menu as a whole says", () => {
  test("onAction receives the value the item was built from", () => {
    const actions: [Key, Action][] = [];
    render(() => (
      <Menu
        aria-label="Actions"
        items={ACTIONS}
        onAction={(key: Key, action: Action) => actions.push([key, action])}
      >
        {(action: Action) => <MenuItem>{action.name}</MenuItem>}
      </Menu>
    ));

    user.click(screen.getByRole("menuitem", { name: "Copy" }));
    expect(actions).toEqual([["copy", ACTIONS[1] as Action]]);
  });

  test("shouldCloseOnSelect on the menu holds every item open", () => {
    let closed = 0;
    render(() => (
      <Menu
        aria-label="Actions"
        items={ACTIONS}
        shouldCloseOnSelect={false}
        onClose={() => closed++}
      >
        {(action: Action) => <MenuItem>{action.name}</MenuItem>}
      </Menu>
    ));

    user.click(screen.getByRole("menuitem", { name: "Copy" }));
    expect(closed).toBe(0);
  });

  test("an item's own shouldCloseOnSelect wins over the menu's", () => {
    let closed = 0;
    render(() => (
      <Menu
        aria-label="Actions"
        items={ACTIONS}
        shouldCloseOnSelect={false}
        onClose={() => closed++}
      >
        {(action: Action) => (
          <MenuItem shouldCloseOnSelect={action.id === "copy"}>{action.name}</MenuItem>
        )}
      </Menu>
    ));

    user.click(screen.getByRole("menuitem", { name: "Copy" }));
    expect(closed).toBe(1);
  });

  test("a section's shouldCloseOnSelect covers its items", () => {
    let closed = 0;
    const grouped = [{ id: "edit", name: "Edit", children: ACTIONS.slice(0, 2) }];
    render(() => (
      <Menu aria-label="Actions" items={grouped} onClose={() => closed++}>
        {(entry: Named) => (
          <MenuSection heading={entry.name} shouldCloseOnSelect={false}>
            {(action: Action) => <MenuItem>{action.name}</MenuItem>}
          </MenuSection>
        )}
      </Menu>
    ));

    user.click(screen.getByRole("menuitem", { name: "Cut" }));
    expect(closed).toBe(0);
  });

  test("an empty menu says why", () => {
    render(() => (
      <Menu aria-label="Actions" items={[] as Action[]} renderEmpty={<span>No actions</span>}>
        {(action: Action) => <MenuItem>{action.name}</MenuItem>}
      </Menu>
    ));

    expect(screen.getByRole("menuitem").textContent).toBe("No actions");
    expect(screen.getByRole("menu").hasAttribute("data-empty")).toBe(true);
  });

  test("a virtualised item's set size counts items, not sections", () => {
    const grouped = [
      { id: "edit", name: "Edit", children: ACTIONS.slice(0, 2) },
      { id: "more", name: "More", children: ACTIONS.slice(3) },
    ];
    function Item(props: ItemProps) {
      const ref = makeRef<HTMLLIElement>();
      const { menuItemProps } = menuItem(
        { key: "cut", ref, baseId: "menu", isVirtualized: true },
        props.state,
      );
      return (
        <li {...menuItemProps} ref={ref.set}>
          Cut
        </li>
      );
    }
    function Harness() {
      const state = listState({ items: () => grouped }) as unknown as ListState<unknown>;
      return (
        <ul role="menu" aria-label="Actions">
          <Item state={state} />
        </ul>
      );
    }
    render(() => <Harness />);

    expect(screen.getByRole("menuitem").getAttribute("aria-setsize"), "sections were counted").toBe(
      "3",
    );
  });

  test("items say how the menu selects", () => {
    render(() => <Actions selectionMode="multiple" />);
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Copy" }).getAttribute("data-selection-mode"),
    ).toBe("multiple");
  });
});

describe("typeahead", () => {
  const FRUIT = [
    { id: "apple", name: "Apple" },
    { id: "banana", name: "Banana" },
    { id: "blueberry", name: "Blueberry" },
  ];

  test("the same letter again steps to the next item starting with it", () => {
    render(() => (
      <Menu aria-label="Fruit" items={FRUIT}>
        {(fruit: Named) => <MenuItem>{fruit.name}</MenuItem>}
      </Menu>
    ));
    user.focus(screen.getByRole("menu"));
    user.keyDown("b");
    flush();
    user.keyDown("b");
    flush();

    expect(document.activeElement?.textContent).toBe("Blueberry");
  });
});

interface CommandsProps {
  onAction?: (key: Key) => void;
}

describe("inside an autocomplete", () => {
  function Search() {
    const auto = useAutocompleteInput();
    const domRef = makeRef<HTMLInputElement>();
    const { inputProps, labelProps } = searchField(
      { label: "Command", ...auto?.inputOptions },
      domRef,
    );
    return (
      <>
        <label {...labelProps}>Command</label>
        <input
          {...mergeProps(inputProps, auto?.inputProps ?? {})}
          ref={mergeRefs(domRef.set, auto?.ref)}
        />
      </>
    );
  }

  const includes: AutocompleteFilter = (text, query) =>
    text.toLowerCase().includes(query.toLowerCase());

  function Commands(props: CommandsProps) {
    return (
      <Autocomplete filter={includes}>
        <Search />
        <Menu aria-label="Commands" items={ACTIONS} onAction={props.onAction}>
          {(action: Action) => <MenuItem>{action.name}</MenuItem>}
        </Menu>
      </Autocomplete>
    );
  }

  test("the field's query narrows the items", () => {
    render(() => <Commands />);
    const field = screen.getByRole("searchbox");
    user.focus(field);
    user.type(field, "co");
    flush();

    expect(screen.getAllByRole("menuitem").map((item: Element) => item.textContent)).toEqual([
      "Copy",
    ]);
  });

  test("the arrows highlight an item while focus stays in the field, and Enter chooses it", async () => {
    const actions: Key[] = [];
    render(() => <Commands onAction={(key) => actions.push(key)} />);
    const field = screen.getByRole("searchbox");
    user.focus(field);
    flush();

    user.keyDown("ArrowDown");
    flush();
    await tick();
    flush();

    expect(document.activeElement).toBe(field);
    const active = field.getAttribute("aria-activedescendant");
    expect(active, "the field names no highlighted item").toBeTruthy();
    expect(document.getElementById(active as string)?.textContent).toBe("Cut");

    user.key("Enter");
    flush();
    expect(actions).toEqual(["cut"]);
  });

  test("the menu is named by the caller first", () => {
    render(() => <Commands />);
    expect(accessibleName(screen.getByRole("menu"))).toBe("Commands");
  });
});

describe("a selection indicator", () => {
  test("is shown in the selected item only", () => {
    render(() => (
      <Menu
        aria-label="Actions"
        items={ACTIONS}
        selectionMode="single"
        defaultSelectedKeys={["copy"]}
      >
        {(action: Action) => (
          <MenuItem>
            {action.name}
            <SelectionIndicator data-testid="indicator" />
          </MenuItem>
        )}
      </Menu>
    ));
    function shown(role: string): (string | null)[] {
      return screen
        .queryAllByTestId("indicator")
        .map(
          (element: Element) =>
            element.closest(`[role="${role}"]`)?.getAttribute("data-key") ?? null,
        );
    }
    expect(shown("menuitemradio")).toEqual(["copy"]);
  });
});
