import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { type Child, createSignal, flush, provide } from "@barqjs/core";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  user,
  within,
} from "@barqjs/testing";
import { Button } from "./button.tsx";
import type { Key } from "./collections.ts";
import {
  dragSession,
  type DroppableCollectionOnItemDropEvent,
  type DroppableCollectionReorderEvent,
  type DropTarget,
  isTextDropItem,
} from "./dnd/index.ts";
import {
  DragButton,
  dragAndDrop,
  type DragAndDropOptions,
  DropIndicator,
} from "./drag-and-drop.tsx";
import type { KeyboardNavigationBehavior } from "./gridlist.tsx";
import { provideLocale } from "./i18n.ts";
import { RouterContext } from "./interactions/open-link.ts";
import { clearAnnouncer, destroyAnnouncer } from "./live.ts";
import {
  announcements,
  fireDrag,
  MockDataTransfer,
  nextFrame,
  restoreRects,
  stubRects,
} from "./test-dnd.ts";
import {
  Tree,
  TreeHeader,
  TreeItem,
  TreeItemContent,
  TreeItemDescription,
  TreeItemExpandButton,
  TreeItemSelectionCheckbox,
  TreeLoadMoreItem,
  TreeSection,
  type TreeItemRenderState,
  type TreeRenderState,
} from "./tree.tsx";
import { listLayout, Virtualizer } from "./virtualizer.tsx";

interface Folder {
  id: Key;
  name: string;
  kind?: "section" | "loader";
  children?: Folder[];
  href?: string;
  isDisabled?: boolean;
  hasChildItems?: boolean;
}

/** Twenty rows with every row expanded, and nine with only the top two showing. */
const FOLDERS: Folder[] = [
  {
    id: "projects",
    name: "Projects",
    children: [
      { id: "project-1", name: "Project 1" },
      {
        id: "project-2",
        name: "Project 2",
        children: [
          { id: "project-2A", name: "Project 2A" },
          { id: "project-2B", name: "Project 2B" },
          { id: "project-2C", name: "Project 2C" },
        ],
      },
      { id: "project-3", name: "Project 3" },
      { id: "project-4", name: "Project 4" },
      {
        id: "project-5",
        name: "Project 5",
        children: [
          { id: "project-5A", name: "Project 5A" },
          { id: "project-5B", name: "Project 5B" },
          { id: "project-5C", name: "Project 5C" },
        ],
      },
    ],
  },
  {
    id: "reports",
    name: "Reports",
    children: [
      {
        id: "reports-1",
        name: "Reports 1",
        children: [
          {
            id: "reports-1A",
            name: "Reports 1A",
            children: [
              {
                id: "reports-1AB",
                name: "Reports 1AB",
                children: [{ id: "reports-1ABC", name: "Reports 1ABC" }],
              },
            ],
          },
          { id: "reports-1B", name: "Reports 1B" },
          { id: "reports-1C", name: "Reports 1C" },
        ],
      },
      { id: "reports-2", name: "Reports 2" },
    ],
  },
];

const ALL_EXPANDED = [
  "projects",
  "project-2",
  "project-5",
  "reports",
  "reports-1",
  "reports-1A",
  "reports-1AB",
];

interface FilesProps {
  items?: Folder[];
  selectionMode?: "none" | "single" | "multiple";
  selectionBehavior?: "toggle" | "replace";
  selectedKeys?: Iterable<Key>;
  disabledKeys?: Iterable<Key>;
  disabledBehavior?: "all" | "selection";
  expandedKeys?: Iterable<Key>;
  defaultExpandedKeys?: Iterable<Key>;
  escapeKeyBehavior?: "clearSelection" | "none";
  keyboardNavigationBehavior?: KeyboardNavigationBehavior;
  shouldSelectOnPressUp?: boolean;
  withControls?: boolean;
  onAction?: (key: Key) => void;
  onSelectionChange?: (keys: "all" | Set<Key>) => void;
  onExpandedChange?: (keys: Set<Key>) => void;
  renderEmptyState?: (tree: TreeRenderState) => Child;
}

function Content(props: { folder: Folder; withControls?: boolean }) {
  return (
    <TreeItemContent>
      {(item: TreeItemRenderState) => (
        <>
          {() =>
            props.withControls === true &&
            item.selectionMode() !== "none" &&
            item.selectionBehavior() === "toggle" ? (
              <TreeItemSelectionCheckbox />
            ) : null
          }
          {() =>
            item.hasChildItems() ? (
              <TreeItemExpandButton>{() => (item.isExpanded() ? "v" : ">")}</TreeItemExpandButton>
            ) : null
          }
          <span>{props.folder.name}</span>
          {() =>
            props.withControls === true ? (
              <>
                <Button aria-label="Info">i</Button>
                <Button aria-label="Menu">=</Button>
              </>
            ) : null
          }
        </>
      )}
    </TreeItemContent>
  );
}

function Files(props: FilesProps) {
  return (
    <Tree
      aria-label="Files"
      items={props.items ?? FOLDERS}
      defaultExpandedKeys={props.defaultExpandedKeys ?? ALL_EXPANDED}
      expandedKeys={props.expandedKeys}
      selectionMode={props.selectionMode}
      selectionBehavior={props.selectionBehavior}
      selectedKeys={props.selectedKeys}
      disabledKeys={props.disabledKeys}
      disabledBehavior={props.disabledBehavior}
      escapeKeyBehavior={props.escapeKeyBehavior}
      keyboardNavigationBehavior={props.keyboardNavigationBehavior}
      shouldSelectOnPressUp={props.shouldSelectOnPressUp}
      onAction={props.onAction}
      onSelectionChange={props.onSelectionChange}
      onExpandedChange={props.onExpandedChange}
      renderEmptyState={props.renderEmptyState}
    >
      {(folder: Folder) => (
        <TreeItem>
          <Content folder={folder} withControls={props.withControls} />
        </TreeItem>
      )}
    </Tree>
  );
}

function rows(): HTMLElement[] {
  return screen.getAllByRole("row");
}

function row(name: string): HTMLElement {
  return screen.getByRole("row", { name });
}

function focusedName(): string | null | undefined {
  return document.activeElement?.getAttribute("aria-label");
}

function press(key: string, options: { shiftKey?: boolean } = {}): void {
  user.keyboard(`{${key}}`, options);
  flush();
}

function byKey(a: Key, b: Key): number {
  return String(a).localeCompare(String(b));
}

function sorted(set: "all" | Set<Key>): Key[] | "all" {
  return set === "all" ? "all" : [...set].toSorted(byKey);
}

describe("Tree", () => {
  test("is a named treegrid of rows, each holding one cell", () => {
    render(() => <Files />);

    const grid = screen.getByRole("treegrid");
    expect(accessibleName(grid)).toBe("Files");
    expect(rows()).toHaveLength(20);
    expect(screen.getAllByRole("gridcell")).toHaveLength(20);
    expect(grid.hasAttribute("aria-multiselectable")).toBe(false);
  });

  test("every row states its level, position, set size and expansion", () => {
    render(() => <Files />);
    const all = rows();

    const projects = all[0] as HTMLElement;
    expect(projects.getAttribute("aria-label")).toBe("Projects");
    expect(projects.getAttribute("aria-expanded")).toBe("true");
    expect(projects.getAttribute("aria-level")).toBe("1");
    expect(projects.getAttribute("aria-posinset")).toBe("1");
    expect(projects.getAttribute("aria-setsize")).toBe("2");
    expect(projects.hasAttribute("data-has-child-items")).toBe(true);
    expect(projects.hasAttribute("data-expanded")).toBe(true);
    expect(projects.getAttribute("data-level")).toBe("1");

    const project2 = all[2] as HTMLElement;
    expect(project2.getAttribute("aria-label")).toBe("Project 2");
    expect(project2.getAttribute("aria-level")).toBe("2");
    expect(project2.getAttribute("aria-posinset")).toBe("2");
    expect(project2.getAttribute("aria-setsize")).toBe("5");

    const project5 = all[8] as HTMLElement;
    expect(project5.getAttribute("aria-label")).toBe("Project 5");
    expect(project5.getAttribute("aria-posinset")).toBe("5");
    expect(project5.getAttribute("aria-setsize")).toBe("5");

    const reports = all[12] as HTMLElement;
    expect(reports.getAttribute("aria-label")).toBe("Reports");
    expect(reports.getAttribute("aria-posinset")).toBe("2");
    expect(reports.getAttribute("aria-setsize")).toBe("2");

    const deepest = all[16] as HTMLElement;
    expect(deepest.getAttribute("aria-label")).toBe("Reports 1ABC");
    expect(deepest.getAttribute("aria-level")).toBe("5");
    expect(deepest.getAttribute("aria-posinset")).toBe("1");
    expect(deepest.getAttribute("aria-setsize")).toBe("1");
    expect(deepest.getAttribute("data-level")).toBe("5");
    expect(deepest.style.getPropertyValue("--tree-item-level")).toBe("5");

    const leaf = all[1] as HTMLElement;
    expect(leaf.hasAttribute("aria-expanded")).toBe(false);
    expect(leaf.hasAttribute("data-expanded")).toBe(false);
    expect(leaf.hasAttribute("data-has-child-items")).toBe(false);
  });

  test("a resting tree and its rows carry none of the state attributes", () => {
    render(() => <Files defaultExpandedKeys={[]} />);
    const grid = screen.getByRole("treegrid");
    for (const name of [
      "data-empty",
      "data-focused",
      "data-focus-visible",
      "data-selection-mode",
    ]) {
      expect(grid.hasAttribute(name)).toBe(false);
    }
    for (const element of rows()) {
      for (const name of [
        "data-selected",
        "data-disabled",
        "data-hovered",
        "data-focused",
        "data-focus-visible",
        "data-pressed",
        "data-selection-mode",
      ]) {
        expect(element.hasAttribute(name)).toBe(false);
      }
    }
  });

  test("a row that cannot be selected does not claim to be unselected", () => {
    render(() => <Files />);
    for (const element of rows()) expect(element.hasAttribute("aria-selected")).toBe(false);
  });

  test("multiple selection says so on the tree and on every row", () => {
    render(() => <Files selectionMode="multiple" />);
    const grid = screen.getByRole("treegrid");
    expect(grid.getAttribute("aria-multiselectable")).toBe("true");
    expect(grid.getAttribute("data-selection-mode")).toBe("multiple");
    expect(rows()[0]?.getAttribute("aria-selected")).toBe("false");
    expect(rows()[0]?.getAttribute("data-selection-mode")).toBe("multiple");
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Files selectionMode="multiple" withControls />);
    expectNoAriaViolations(container);
  });
});

describe("the expand button", () => {
  test("is named for what it does, followed by the row it does it to", () => {
    render(() => <Files />);
    for (const element of rows()) {
      if (!element.hasAttribute("data-has-child-items")) continue;
      const toggle = within(element).getByRole("button");
      expect(toggle.getAttribute("aria-labelledby")).toBe(`${toggle.id} ${element.id}`);
      expect(toggle.getAttribute("aria-label")).toBe("Collapse");
      expect(accessibleName(toggle)).toBe(`Collapse ${element.getAttribute("aria-label")}`);
    }
  });

  test("is not a Tab stop and does not take focus", () => {
    render(() => <Files />);
    const toggle = within(row("Projects")).getByRole("button");
    expect(toggle.getAttribute("tabindex")).toBe("-1");
    expect(toggle.hasAttribute("data-barq-prevent-focus")).toBe(true);
  });

  test("toggles the row, and its name follows", () => {
    const changes: Key[][] = [];
    render(() => <Files onExpandedChange={(keys) => changes.push([...keys].toSorted(byKey))} />);

    const projects = row("Projects");
    const toggle = within(projects).getByRole("button");
    user.click(toggle);
    flush();

    expect(projects.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toBe("Expand");
    expect(rows()).toHaveLength(9);
    expect(changes).toEqual([ALL_EXPANDED.filter((key) => key !== "projects").toSorted(byKey)]);
  });

  test("is translated with the locale in scope", () => {
    function German(props: { children?: Child }) {
      provideLocale("de-DE");
      return <>{props.children}</>;
    }
    render(() => (
      <German>
        <Files />
      </German>
    ));
    const toggle = within(row("Projects")).getByRole("button");
    expect(toggle.getAttribute("aria-label")).toBe("Reduzieren");
    user.click(toggle);
    flush();
    expect(toggle.getAttribute("aria-label")).toBe("Erweitern");
  });

  test("a row that says it has children is expandable before they arrive", () => {
    const changes: Key[][] = [];
    render(() => (
      <Files
        items={[{ id: "folder", name: "Folder", hasChildItems: true }]}
        defaultExpandedKeys={[]}
        onExpandedChange={(keys) => changes.push([...keys])}
      />
    ));
    const folder = row("Folder");
    expect(folder.getAttribute("aria-expanded")).toBe("false");

    user.click(within(folder).getByRole("button"));
    flush();

    expect(folder.getAttribute("aria-expanded")).toBe("true");
    expect(changes).toEqual([["folder"]]);
  });
});

describe("keyboard", () => {
  test("Tab enters the tree on its first row", () => {
    render(() => <Files />);
    user.tab();
    expect(document.activeElement).toBe(rows()[0] as HTMLElement);
  });

  test("up and down move between the rows that are showing", () => {
    render(() => <Files />);
    user.tab();

    press("ArrowDown");
    expect(focusedName()).toBe("Project 1");
    press("ArrowUp");
    expect(focusedName()).toBe("Projects");

    press("ArrowLeft");
    expect(rows()).toHaveLength(9);
    press("ArrowDown");
    expect(focusedName()).toBe("Reports");
    press("ArrowUp");
    expect(focusedName()).toBe("Projects");
  });

  test("Home and End go to the first and the last row that is showing", () => {
    render(() => <Files />);
    user.tab();

    press("End");
    expect(focusedName()).toBe("Reports 2");
    press("Home");
    expect(focusedName()).toBe("Projects");

    user.click(row("Reports"));
    flush();
    expect(rows()).toHaveLength(13);
    press("Home");
    press("End");
    expect(focusedName()).toBe("Reports");
  });

  test("Page Down and Page Up reach the ends of a tree that does not scroll", () => {
    render(() => <Files />);
    user.tab();
    press("PageDown");
    expect(focusedName()).toBe("Reports 2");
    press("PageUp");
    expect(focusedName()).toBe("Projects");
  });

  test("Right expands a closed row; Left collapses an open one and then moves to the parent", () => {
    render(() => <Files />);
    user.tab();

    press("ArrowDown");
    press("ArrowDown");
    expect(focusedName()).toBe("Project 2");
    press("ArrowLeft");
    expect(row("Project 2").getAttribute("aria-expanded")).toBe("false");
    press("ArrowRight");
    expect(row("Project 2").getAttribute("aria-expanded")).toBe("true");
    expect(focusedName()).toBe("Project 2");

    press("ArrowDown");
    press("ArrowDown");
    expect(focusedName()).toBe("Project 2B");

    // A leaf has nothing to collapse: Left moves to its parent.
    press("ArrowLeft");
    expect(focusedName()).toBe("Project 2");
    expect(row("Project 2").getAttribute("aria-expanded")).toBe("true");

    press("ArrowLeft");
    expect(row("Project 2").getAttribute("aria-expanded")).toBe("false");
    expect(focusedName()).toBe("Project 2");

    press("ArrowLeft");
    expect(focusedName()).toBe("Projects");

    // A top-level row has no parent to move to.
    press("ArrowLeft");
    press("ArrowLeft");
    expect(row("Projects").getAttribute("aria-expanded")).toBe("false");
  });

  test("in a right-to-left page the arrows trade places", () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-AE");
      return <>{props.children}</>;
    }
    render(() => (
      <Arabic>
        <Files />
      </Arabic>
    ));
    user.tab();

    press("ArrowRight");
    expect(row("Projects").getAttribute("aria-expanded")).toBe("false");
    press("ArrowLeft");
    expect(row("Projects").getAttribute("aria-expanded")).toBe("true");
    press("ArrowDown");
    press("ArrowRight");
    expect(focusedName()).toBe("Projects");
  });

  test("Left and Right walk the controls in a row, and Left and Right on the row itself expand first", () => {
    render(() => <Files selectionMode="multiple" withControls />);
    const projects = row("Projects");
    const checkbox = within(projects).getByRole("checkbox");
    const info = within(projects).getByRole("button", { name: "Info" });
    const menu = within(projects).getByRole("button", { name: "Menu" });

    user.tab();
    expect(document.activeElement).toBe(projects);

    // Already open, so Right goes in. The expand button is not a stop.
    press("ArrowRight");
    expect(document.activeElement).toBe(checkbox);
    press("ArrowRight");
    expect(document.activeElement).toBe(info);
    press("ArrowRight");
    expect(document.activeElement).toBe(menu);
    press("ArrowRight");
    expect(document.activeElement).toBe(projects);

    press("ArrowLeft");
    expect(document.activeElement).toBe(projects);
    expect(projects.getAttribute("aria-expanded")).toBe("false");
    press("ArrowRight");
    expect(document.activeElement).toBe(projects);
    expect(projects.getAttribute("aria-expanded")).toBe("true");

    press("ArrowLeft");
    press("ArrowLeft");
    expect(document.activeElement).toBe(menu);
    press("ArrowLeft");
    expect(document.activeElement).toBe(info);
    press("ArrowLeft");
    expect(document.activeElement).toBe(checkbox);
  });

  test("Down from a control inside a row moves to the next row", () => {
    render(() => <Files withControls />);
    user.tab();
    press("ArrowRight");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Info");
    press("ArrowDown");
    expect(focusedName()).toBe("Project 1");
  });

  test("typing jumps to a showing row, and never to a hidden one", () => {
    render(() => <Files />);
    user.tab();

    user.keyboard("Reports 1ABC");
    flush();
    expect(focusedName()).toBe("Reports 1ABC");
  });

  test("typing does not reach a row inside a collapsed parent", () => {
    render(() => <Files defaultExpandedKeys={["projects"]} />);
    user.tab();
    user.keyboard("Reports 1");
    flush();
    expect(focusedName()).toBe("Reports");
  });

  test("a disabled row is skipped", () => {
    render(() => <Files disabledKeys={["project-1"]} />);
    user.tab();
    press("ArrowDown");
    expect(focusedName()).toBe("Project 2");
  });

  test("under disabledBehavior selection a disabled row is still reached", () => {
    render(() => (
      <Files selectionMode="multiple" disabledKeys={["project-1"]} disabledBehavior="selection" />
    ));
    user.tab();
    press("ArrowDown");
    expect(focusedName()).toBe("Project 1");
    expect(row("Project 1").hasAttribute("data-disabled")).toBe(false);
    expect(row("Project 1").hasAttribute("data-focus-visible")).toBe(true);
  });
});

describe("expanding and collapsing", () => {
  test("pressing a parent row with nothing else to do toggles it, by mouse and by Enter", () => {
    const changes: Key[][] = [];
    render(() => <Files onExpandedChange={(keys) => changes.push([...keys].toSorted(byKey))} />);

    user.tab();
    press("Enter");
    expect(row("Projects").hasAttribute("data-expanded")).toBe(false);
    expect(rows()).toHaveLength(9);
    // A collapsed parent's own expanded children stay in the set.
    expect(changes[0]).toEqual(ALL_EXPANDED.filter((key) => key !== "projects").toSorted(byKey));

    press("Enter");
    expect(rows()).toHaveLength(20);
    expect(changes[1]).toEqual([...ALL_EXPANDED].toSorted(byKey));

    user.click(row("Project 2"));
    flush();
    expect(row("Project 2").hasAttribute("data-expanded")).toBe(false);
    expect(row("Projects").hasAttribute("data-expanded")).toBe(true);
    expect(rows()).toHaveLength(17);

    // The nested row stays closed when its parent closes and opens again.
    user.click(row("Projects"));
    flush();
    user.click(row("Projects"));
    flush();
    expect(rows()).toHaveLength(17);
    expect(row("Project 2").getAttribute("aria-expanded")).toBe("false");
  });

  test("a selectable row selects on press and expands only from its button or the arrows", () => {
    const changes: Key[][] = [];
    const selections: (Key[] | "all")[] = [];
    render(() => (
      <Files
        selectionMode="multiple"
        onExpandedChange={(keys) => changes.push([...keys])}
        onSelectionChange={(keys) => selections.push(sorted(keys))}
      />
    ));

    user.tab();
    press("Enter");
    expect(row("Projects").getAttribute("aria-expanded")).toBe("true");
    expect(selections).toEqual([["projects"]]);
    press("Enter");
    expect(selections).toEqual([["projects"], []]);
    expect(changes).toEqual([]);

    user.click(within(row("Projects")).getByRole("button"));
    flush();
    expect(row("Projects").getAttribute("aria-expanded")).toBe("false");
    expect(changes).toHaveLength(1);
    expect(selections).toHaveLength(2);
  });

  test("a row with an action performs it instead of expanding", () => {
    const acted: Key[] = [];
    const changes: Key[][] = [];
    render(() => (
      <Files
        onAction={(key) => acted.push(key)}
        onExpandedChange={(keys) => changes.push([...keys])}
      />
    ));

    user.tab();
    press("Enter");
    expect(acted).toEqual(["projects"]);
    expect(row("Projects").getAttribute("aria-expanded")).toBe("true");

    press("ArrowLeft");
    expect(row("Projects").getAttribute("aria-expanded")).toBe("false");
    expect(changes).toHaveLength(1);
    expect(acted).toEqual(["projects"]);
  });

  test("a controlled tree reports and waits for its parent", () => {
    const [open, setOpen] = createSignal<Key[]>(["projects"]);
    const reported: Key[][] = [];
    render(() => (
      <Files
        expandedKeys={open()}
        onExpandedChange={(keys) => reported.push([...keys])}
        items={FOLDERS.slice(0, 1)}
      />
    ));
    expect(rows()).toHaveLength(6);

    user.click(within(row("Project 2")).getByRole("button"));
    flush();
    expect(reported).toEqual([["projects", "project-2"]]);
    expect(rows()).toHaveLength(6);

    setOpen(["projects", "project-2"]);
    flush();
    expect(rows()).toHaveLength(9);
    expect(row("Project 2").getAttribute("aria-expanded")).toBe("true");
  });

  test("children that arrive when a row opens can be walked into", () => {
    const [items, setItems] = createSignal<Folder[]>([
      { id: "projects", name: "Projects", hasChildItems: true },
      { id: "reports", name: "Reports" },
    ]);
    render(() => (
      <Files
        items={items()}
        defaultExpandedKeys={[]}
        onExpandedChange={(open) => {
          if (open.has("projects") && items()[0]?.children === undefined) {
            setItems([
              {
                id: "projects",
                name: "Projects",
                children: [
                  { id: "project-1", name: "Project 1" },
                  { id: "project-2", name: "Project 2" },
                ],
              },
              { id: "reports", name: "Reports" },
            ]);
          }
        }}
      />
    ));
    expect(rows()).toHaveLength(2);

    user.tab();
    press("ArrowRight");
    expect(rows()).toHaveLength(4);
    expect(focusedName()).toBe("Projects");

    press("ArrowDown");
    expect(focusedName()).toBe("Project 1");
    expect(document.activeElement?.getAttribute("aria-level")).toBe("2");
    press("ArrowLeft");
    expect(focusedName()).toBe("Projects");
  });
});

describe("selection", () => {
  test("clicking rows toggles them under the default behaviour", () => {
    const selections: (Key[] | "all")[] = [];
    render(() => (
      <Files selectionMode="multiple" onSelectionChange={(keys) => selections.push(sorted(keys))} />
    ));

    user.click(row("Projects"));
    flush();
    user.click(row("Project 2A"));
    flush();

    expect(selections).toEqual([["projects"], ["project-2A", "projects"]]);
    expect(row("Project 2A").getAttribute("aria-selected")).toBe("true");
    expect(row("Project 2A").hasAttribute("data-selected")).toBe(true);
  });

  test("single selection replaces", () => {
    const selections: (Key[] | "all")[] = [];
    render(() => (
      <Files selectionMode="single" onSelectionChange={(keys) => selections.push(sorted(keys))} />
    ));
    user.click(row("Projects"));
    flush();
    user.click(row("Reports"));
    flush();
    expect(selections).toEqual([["projects"], ["reports"]]);
  });

  test("Shift extends a range across levels, in the order the rows are drawn", () => {
    let last: Key[] | "all" = [];
    render(() => (
      <Files selectionMode="multiple" onSelectionChange={(keys) => (last = sorted(keys))} />
    ));

    user.click(row("Project 2B"));
    flush();
    user.click(row("Projects"), { shiftKey: true });
    flush();
    expect(last).toEqual(["project-1", "project-2", "project-2A", "project-2B", "projects"]);

    user.click(row("Project 3"), { shiftKey: true });
    flush();
    expect(last).toEqual(["project-2B", "project-2C", "project-3"]);
  });

  test("Shift and Down extend the selection from the keyboard", () => {
    let last: Key[] | "all" = [];
    render(() => (
      <Files
        selectionMode="multiple"
        defaultExpandedKeys={["projects"]}
        onSelectionChange={(keys) => (last = sorted(keys))}
      />
    ));
    user.tab();
    press(" ");
    press("ArrowDown", { shiftKey: true });
    press("ArrowDown", { shiftKey: true });
    expect(last).toEqual(["project-1", "project-2", "projects"]);
  });

  test("select all takes the rows that are showing", () => {
    const selections: (Key[] | "all")[] = [];
    render(() => (
      <Files
        selectionMode="multiple"
        defaultExpandedKeys={["projects"]}
        onSelectionChange={(keys) => selections.push(sorted(keys))}
      />
    ));
    user.tab();
    user.keyDown("a", { ctrlKey: true, metaKey: true });
    flush();
    expect(selections).toEqual(["all"]);
    for (const element of rows()) expect(element.getAttribute("aria-selected")).toBe("true");
  });

  test("Escape clears, unless told not to", () => {
    let last: Key[] | "all" = [];
    render(() => (
      <Files selectionMode="multiple" onSelectionChange={(keys) => (last = sorted(keys))} />
    ));
    user.click(row("Projects"));
    flush();
    user.click(row("Reports"));
    flush();
    press("Escape");
    expect(last).toEqual([]);
  });

  test("escapeKeyBehavior none keeps the selection", () => {
    const selections: (Key[] | "all")[] = [];
    render(() => (
      <Files
        selectionMode="multiple"
        escapeKeyBehavior="none"
        onSelectionChange={(keys) => selections.push(sorted(keys))}
      />
    ));
    user.click(row("Projects"));
    flush();
    user.click(row("Reports"));
    flush();
    press("Escape");
    expect(selections).toHaveLength(2);
    expect(row("Projects").hasAttribute("data-selected")).toBe(true);
    expect(row("Reports").hasAttribute("data-selected")).toBe(true);
  });

  test("replace behaviour selects only what was pressed, and follows the keyboard", () => {
    const selections: (Key[] | "all")[] = [];
    render(() => (
      <Files
        selectionMode="multiple"
        selectionBehavior="replace"
        onSelectionChange={(keys) => selections.push(sorted(keys))}
      />
    ));
    user.click(row("Projects"));
    flush();
    user.click(row("Reports"));
    flush();
    press("ArrowDown");
    expect(selections).toEqual([["projects"], ["reports"], ["reports-1"]]);
  });

  test("a controlled selection is what the rows show", () => {
    const [chosen, setChosen] = createSignal<Key[]>(["project-1"]);
    render(() => <Files selectionMode="multiple" selectedKeys={chosen()} />);
    expect(row("Project 1").getAttribute("aria-selected")).toBe("true");

    user.click(row("Project 3"));
    flush();
    expect(row("Project 3").getAttribute("aria-selected")).toBe("false");

    setChosen(["project-3"]);
    flush();
    expect(row("Project 3").getAttribute("aria-selected")).toBe("true");
    expect(row("Project 1").getAttribute("aria-selected")).toBe("false");
  });

  test("a disabled row cannot be selected", () => {
    const selections: (Key[] | "all")[] = [];
    render(() => (
      <Files
        selectionMode="multiple"
        disabledKeys={["projects"]}
        onSelectionChange={(keys) => selections.push(sorted(keys))}
      />
    ));
    expect(row("Projects").getAttribute("aria-disabled")).toBe("true");
    expect(row("Projects").hasAttribute("data-disabled")).toBe(true);
    user.click(row("Projects"));
    flush();
    expect(selections).toEqual([]);
  });

  test("an item disabled in the data is disabled", () => {
    render(() => (
      <Files
        selectionMode="multiple"
        items={[
          { id: "a", name: "Alpha" },
          { id: "b", name: "Beta", isDisabled: true },
        ]}
      />
    ));
    expect(row("Beta").getAttribute("aria-disabled")).toBe("true");
    user.tab();
    press("ArrowDown");
    expect(focusedName()).toBe("Alpha");
  });

  test("the selection checkbox selects its row and is named for it", () => {
    render(() => <Files selectionMode="multiple" withControls />);
    const projects = row("Projects");
    const checkbox = within(projects).getByRole<HTMLInputElement>("checkbox");
    expect(accessibleName(checkbox)).toBe("Select Projects");

    user.click(checkbox);
    flush();
    expect(projects.getAttribute("aria-selected")).toBe("true");
    expect(checkbox.checked).toBe(true);
  });

  test("selects on press up when asked", () => {
    const selections: (Key[] | "all")[] = [];
    render(() => (
      <Files
        selectionMode="multiple"
        shouldSelectOnPressUp
        onSelectionChange={(keys) => selections.push(sorted(keys))}
      />
    ));
    user.pointerDown(row("Projects"));
    flush();
    expect(selections).toEqual([]);
    user.pointerUp(row("Projects"));
    user.click(row("Projects"));
    flush();
    expect(selections).toEqual([["projects"]]);
  });
});

describe("actions and links", () => {
  test("an action fires for the row pressed, by mouse and Enter, and not for a disabled one", () => {
    const acted: Key[] = [];
    const selections: unknown[] = [];
    render(() => (
      <Files
        selectionMode="multiple"
        disabledKeys={["projects"]}
        onAction={(key) => acted.push(key)}
        onSelectionChange={(keys) => selections.push(keys)}
      />
    ));

    user.click(row("Project 1"));
    flush();
    expect(acted).toEqual(["project-1"]);

    user.click(row("Projects"));
    flush();
    expect(acted).toEqual(["project-1"]);

    user.click(row("Project 2"));
    flush();
    press("Enter");
    expect(acted).toEqual(["project-1", "project-2", "project-2"]);
    expect(selections).toEqual([]);
  });

  test("a row with an href is a link that the router follows", () => {
    const opened: string[] = [];
    function Routed() {
      return provide(
        RouterContext,
        () => ({
          isNative: false,
          open: (_target: Element, _modifiers: object, href: string) => opened.push(href),
          href: (href: string) => href,
        }),
        () => (
          <Files
            items={[
              { id: "docs", name: "Docs", href: "/docs" },
              { id: "billing", name: "Billing", href: "/billing" },
            ]}
          />
        ),
      ) as never;
    }
    render(() => <Routed />);
    flush();

    const docs = row("Docs");
    expect(docs.tagName).toBe("DIV");
    expect(docs.getAttribute("data-href")).toBe("/docs");

    user.click(docs);
    flush();
    expect(opened).toEqual(["/docs"]);

    user.tab();
    press("ArrowDown");
    press("Enter");
    expect(opened).toEqual(["/docs", "/billing"]);
  });

  test("a parent row with a link follows it instead of expanding", () => {
    const opened: string[] = [];
    function Routed() {
      return provide(
        RouterContext,
        () => ({
          isNative: false,
          open: (_target: Element, _modifiers: object, href: string) => opened.push(href),
          href: (href: string) => href,
        }),
        () => (
          <Files
            items={[
              {
                id: "docs",
                name: "Docs",
                href: "/docs",
                children: [{ id: "guide", name: "Guide", href: "/docs/guide" }],
              },
            ]}
          />
        ),
      ) as never;
    }
    render(() => <Routed />);
    flush();

    user.click(row("Docs"));
    flush();
    expect(opened).toEqual(["/docs"]);
    expect(row("Docs").getAttribute("aria-expanded")).toBe("false");
  });
});

describe("item events", () => {
  test("press events reach the row", () => {
    const seen: string[] = [];
    render(() => (
      <Tree aria-label="Files" items={FOLDERS.slice(1)}>
        {(folder: Folder) => (
          <TreeItem
            onAction={() => seen.push("action")}
            onPressStart={() => seen.push("start")}
            onPressEnd={() => seen.push("end")}
            onPress={() => seen.push("press")}
            onClick={() => seen.push("click")}
          >
            {folder.name}
          </TreeItem>
        )}
      </Tree>
    ));
    user.click(row("Reports"));
    flush();
    expect(seen).toEqual(["start", "end", "action", "press", "click"]);
  });

  test("focus on the row is reported, focus on a control inside it is not", () => {
    const changes: boolean[] = [];
    let focuses = 0;
    let blurs = 0;
    render(() => (
      <Tree aria-label="Pets" items={[{ id: "cat", name: "Cat" }]}>
        {() => (
          <TreeItem
            onFocus={() => focuses++}
            onBlur={() => blurs++}
            onFocusChange={(isFocused) => changes.push(isFocused)}
          >
            Cat <Button>First action</Button>
            <Button>Second action</Button>
          </TreeItem>
        )}
      </Tree>
    ));

    user.tab();
    expect(document.activeElement).toBe(row("Cat"));
    expect([focuses, blurs]).toEqual([1, 0]);
    expect(changes).toEqual([true]);

    press("ArrowRight");
    expect(document.activeElement?.textContent).toBe("First action");
    expect([focuses, blurs]).toEqual([1, 1]);
    expect(changes).toEqual([true, false]);

    press("ArrowRight");
    expect(document.activeElement?.textContent).toBe("Second action");
    expect([focuses, blurs]).toEqual([1, 1]);
    expect(changes).toEqual([true, false]);
  });

  test("expanding and collapsing a focused row reports no focus change", () => {
    const changes: boolean[] = [];
    render(() => (
      <Tree aria-label="Files" items={FOLDERS.slice(0, 1)} defaultExpandedKeys={["projects"]}>
        {(folder: Folder) => (
          <TreeItem onFocusChange={(isFocused) => changes.push(isFocused)}>{folder.name}</TreeItem>
        )}
      </Tree>
    ));
    user.tab();
    press("ArrowLeft");
    expect(row("Projects").getAttribute("aria-expanded")).toBe("false");
    press("ArrowRight");
    expect(row("Projects").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(row("Projects"));
    expect(changes).toEqual([true]);
  });

  test("a row is hovered only when pressing it would do something", () => {
    render(() => <Files />);
    user.hover(row("Projects"));
    flush();
    expect(row("Projects").hasAttribute("data-hovered")).toBe(true);
    user.hover(row("Project 1"));
    flush();
    expect(row("Project 1").hasAttribute("data-hovered")).toBe(false);
  });

  test("focus visible follows the keyboard, not the pointer", () => {
    render(() => <Files selectionMode="multiple" />);
    user.click(row("Projects"));
    flush();
    expect(row("Projects").hasAttribute("data-focused")).toBe(true);
    expect(row("Projects").hasAttribute("data-focus-visible")).toBe(false);
    press("ArrowDown");
    expect(row("Project 1").hasAttribute("data-focus-visible")).toBe(true);
  });
});

describe("descriptions", () => {
  function Described(props: { showDescription: boolean; label?: string }) {
    return (
      <Tree aria-label="Files" items={[{ id: "projects", name: "Projects" }]}>
        {() => (
          <TreeItem aria-label={props.label}>
            <TreeItemContent>
              <span>Projects</span>
              {() =>
                props.showDescription ? (
                  <TreeItemDescription>Shared with salama</TreeItemDescription>
                ) : null
              }
            </TreeItemContent>
          </TreeItem>
        )}
      </Tree>
    );
  }

  test("the row's name includes its description", () => {
    render(() => <Described showDescription />);
    expect(accessibleName(row("Projects Shared with salama"))).toBe("Projects Shared with salama");
  });

  test("with an explicit label as well", () => {
    render(() => <Described showDescription label="Team projects" />);
    expect(screen.getByRole("row").getAttribute("aria-label")).toBe("Team projects");
    expect(accessibleName(screen.getByRole("row"))).toBe("Team projects Shared with salama");
  });

  test("without one, the row keeps its own name", () => {
    render(() => <Described showDescription={false} />);
    expect(accessibleName(screen.getByRole("row"))).toBe("Projects");
    expect(screen.getByRole("row").hasAttribute("aria-labelledby")).toBe(false);
  });
});

describe("Tab navigation", () => {
  function Editable(props: {
    selectionMode?: "none" | "multiple";
    onSelectionChange?: (keys: "all" | Set<Key>) => void;
  }) {
    return (
      <>
        <input aria-label="Before" />
        <Tree
          aria-label="Fields"
          keyboardNavigationBehavior="tab"
          selectionMode={props.selectionMode}
          onSelectionChange={props.onSelectionChange}
          defaultExpandedKeys={["parent"]}
          items={[
            { id: "field", name: "Field" },
            {
              id: "parent",
              name: "Parent",
              children: [{ id: "child", name: "Child" }],
            },
          ]}
        >
          {(folder: Folder) => (
            <TreeItem>
              <span>{folder.name}</span>
              <input aria-label={`${folder.name} input`} />
            </TreeItem>
          )}
        </Tree>
      </>
    );
  }

  test("Tab goes from the row into its controls and Shift+Tab comes back", () => {
    render(() => <Editable />);
    user.tab();
    user.tab();
    expect(document.activeElement).toBe(row("Field"));
    user.tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Field input");
    user.tab({ shift: true });
    expect(document.activeElement).toBe(row("Field"));
  });

  test("the arrows and typing belong to a field inside a row", () => {
    render(() => <Editable />);
    user.tab();
    user.tab();
    user.tab();
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Field input" });
    expect(document.activeElement).toBe(input);

    for (const key of ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"]) {
      press(key);
      expect(document.activeElement).toBe(input);
    }
    user.keyboard("row");
    flush();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("row");
  });

  test("Space in a field types a space and selects nothing, on a leaf and on a parent", () => {
    const selections: unknown[] = [];
    render(() => (
      <Editable selectionMode="multiple" onSelectionChange={(keys) => selections.push(keys)} />
    ));
    user.tab();
    user.tab();
    user.tab();
    const leaf = screen.getByRole<HTMLInputElement>("textbox", { name: "Field input" });
    user.keyboard(" ");
    flush();
    expect(leaf.value).toBe(" ");

    user.focus(row("Parent"));
    user.tab();
    const parent = screen.getByRole<HTMLInputElement>("textbox", { name: "Parent input" });
    expect(document.activeElement).toBe(parent);
    user.keyboard(" ");
    flush();
    expect(parent.value).toBe(" ");
    expect(selections).toEqual([]);
  });

  test("Right still expands a row that has focus itself", () => {
    render(() => (
      <Tree
        aria-label="Tree"
        keyboardNavigationBehavior="tab"
        items={[
          { id: "parent", name: "Parent", children: [{ id: "child", name: "Child" }] },
          { id: "item", name: "Item" },
        ]}
      >
        {(folder: Folder) => <TreeItem>{folder.name}</TreeItem>}
      </Tree>
    ));
    expect(rows()).toHaveLength(2);
    user.tab();
    press("ArrowRight");
    expect(rows()).toHaveLength(3);
  });
});

describe("focusMode", () => {
  function Actions(props: { behavior?: KeyboardNavigationBehavior; allowsArrows?: boolean }) {
    return (
      <Tree
        aria-label="Actions"
        keyboardNavigationBehavior={props.behavior}
        items={[
          { id: "one", name: "One" },
          { id: "two", name: "Two" },
          { id: "three", name: "Three" },
        ]}
      >
        {(folder: Folder) => (
          <TreeItem focusMode="child" allowsArrowNavigation={props.allowsArrows}>
            <button type="button" aria-label={`${folder.name} action`}>
              Go
            </button>
            <input aria-label={`${folder.name} field`} />
          </TreeItem>
        )}
      </Tree>
    );
  }

  const action = (name: string): HTMLElement =>
    screen.getByRole("button", { name: `${name} action` });

  test("focus arriving on the row moves on to its first control", () => {
    render(() => <Actions behavior="tab" />);
    user.tab();
    expect(document.activeElement).toBe(action("One"));
  });

  test("with arrow navigation allowed, Down moves from control to control under Tab navigation", () => {
    render(() => <Actions behavior="tab" allowsArrows />);
    user.tab();
    expect(document.activeElement).toBe(action("One"));
    press("ArrowDown");
    expect(document.activeElement).toBe(action("Two"));
    press("ArrowUp");
    expect(document.activeElement).toBe(action("One"));
  });

  test("under arrow navigation Down lands on the next row's first control", () => {
    render(() => <Actions />);
    user.tab();
    expect(document.activeElement).toBe(action("One"));
    press("ArrowDown");
    expect(document.activeElement).toBe(action("Two"));
    press("ArrowDown");
    expect(document.activeElement).toBe(action("Three"));
    press("ArrowUp");
    expect(document.activeElement).toBe(action("Two"));
  });
});

describe("the empty state", () => {
  test("is a row at level one, and the empty tree is a Tab stop", () => {
    render(() => (
      <>
        <Tree
          aria-label="Nothing"
          items={[] as Folder[]}
          renderEmptyState={(tree) => (
            <span>{() => `Nothing here, focused: ${String(tree.isFocusVisible())}`}</span>
          )}
        >
          {(folder: Folder) => <TreeItem>{folder.name}</TreeItem>}
        </Tree>
        <button type="button">After</button>
      </>
    ));
    const grid = screen.getByRole("treegrid");
    expect(grid.hasAttribute("data-empty")).toBe(true);
    const empty = screen.getByRole("row");
    expect(empty.getAttribute("aria-level")).toBe("1");
    expect(empty.hasAttribute("aria-posinset")).toBe(false);
    expect(empty.hasAttribute("aria-setsize")).toBe(false);
    expect(within(empty).getByRole("gridcell").textContent).toBe("Nothing here, focused: false");

    user.tab();
    expect(document.activeElement).toBe(grid);
    expect(grid.hasAttribute("data-focused")).toBe(true);
    expect(grid.hasAttribute("data-focus-visible")).toBe(true);
    expect(within(empty).getByRole("gridcell").textContent).toBe("Nothing here, focused: true");

    user.tab();
    expect(document.activeElement?.textContent).toBe("After");
    expect(grid.hasAttribute("data-focused")).toBe(false);
    expect(within(empty).getByRole("gridcell").textContent).toBe("Nothing here, focused: false");
  });

  test("an empty state with links is tabbed through, the tree itself is not a stop", () => {
    render(() => (
      <>
        <button type="button">Before</button>
        <Tree
          aria-label="Nothing"
          items={[] as Folder[]}
          renderEmptyState={(_tree: TreeRenderState) => (
            <div>
              <a href="#none">No results</a>
              <a href="#other">Another link</a>
            </div>
          )}
        >
          {(folder: Folder) => <TreeItem>{folder.name}</TreeItem>}
        </Tree>
        <button type="button">After</button>
      </>
    ));
    flush();
    user.focus(screen.getByRole("button", { name: "Before" }));
    user.tab();
    expect(document.activeElement?.textContent).toBe("No results");
    user.tab();
    expect(document.activeElement?.textContent).toBe("Another link");
    user.tab();
    expect(document.activeElement?.textContent).toBe("After");
    user.tab({ shift: true });
    user.tab({ shift: true });
    expect(document.activeElement?.textContent).toBe("No results");
    user.tab({ shift: true });
    expect(document.activeElement?.textContent).toBe("Before");
  });

  test("rows that arrive while the empty tree has focus are reached with Down", () => {
    const [items, setItems] = createSignal<Folder[]>([]);
    render(() => (
      <Files items={items()} renderEmptyState={(_tree: TreeRenderState) => "No items"} />
    ));
    const grid = screen.getByRole("treegrid");
    user.tab();
    expect(document.activeElement).toBe(grid);

    setItems([
      { id: "one", name: "One" },
      { id: "two", name: "Two" },
    ]);
    flush();
    expect(grid.hasAttribute("data-empty")).toBe(false);
    press("ArrowDown");
    expect(focusedName()).toBe("One");
    press("ArrowDown");
    expect(focusedName()).toBe("Two");
  });
});

describe("focus repair", () => {
  test("the focused row removed, focus moves to the next row that is left", () => {
    const [items, setItems] = createSignal<Folder[]>([
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
      { id: "c", name: "Gamma" },
    ]);
    render(() => <Files items={items()} />);
    user.tab();
    press("ArrowDown");
    expect(focusedName()).toBe("Beta");

    setItems([
      { id: "a", name: "Alpha" },
      { id: "c", name: "Gamma" },
    ]);
    flush();
    expect(focusedName()).toBe("Gamma");
  });

  test("the focused row hidden by a collapse from outside, focus moves to that parent", () => {
    const [open, setOpen] = createSignal<Key[]>(["projects"]);
    render(() => <Files items={FOLDERS.slice(0, 1)} expandedKeys={open()} />);
    user.tab();
    press("ArrowDown");
    expect(focusedName()).toBe("Project 1");

    setOpen([]);
    flush();
    expect(focusedName()).toBe("Projects");
  });
});

describe("sections", () => {
  const SECTIONED: Folder[] = [
    {
      id: "section-1",
      name: "Section 1",
      kind: "section",
      children: [{ id: "photos", name: "Photos" }],
    },
    {
      id: "section-2",
      name: "Section 2",
      kind: "section",
      children: [
        {
          id: "projects",
          name: "Projects",
          children: [
            { id: "project-1", name: "Project 1" },
            { id: "project-2", name: "Project 2" },
          ],
        },
        { id: "reports", name: "Reports" },
      ],
    },
  ];

  function Sectioned() {
    return (
      <Tree
        aria-label="Sectioned"
        items={SECTIONED}
        defaultExpandedKeys={["projects"]}
        getType={(folder: Folder) => (folder.kind === "section" ? "section" : "item")}
      >
        {(folder: Folder) =>
          folder.kind === "section" ? (
            folder.id === "section-1" ? (
              <TreeSection aria-label={folder.name} />
            ) : (
              <TreeSection>
                <TreeHeader>{folder.name}</TreeHeader>
              </TreeSection>
            )
          ) : (
            <TreeItem>{folder.name}</TreeItem>
          )
        }
      </Tree>
    );
  }

  test("each section is a row group named by its label or its header", () => {
    render(() => <Sectioned />);
    const groups = screen.getAllByRole("rowgroup");
    expect(groups).toHaveLength(2);
    expect(groups[0]?.getAttribute("aria-label")).toBe("Section 1");
    expect(accessibleName(groups[1] as HTMLElement)).toBe("Section 2");
    expect(within(groups[1] as HTMLElement).getByRole("rowheader").textContent).toBe("Section 2");
  });

  test("rows count their level and position from their section", () => {
    render(() => <Sectioned />);
    const projects = row("Projects");
    expect(projects.getAttribute("aria-level")).toBe("1");
    expect(projects.getAttribute("aria-posinset")).toBe("1");
    expect(projects.getAttribute("aria-setsize")).toBe("2");
    expect(row("Reports").getAttribute("aria-posinset")).toBe("2");
    expect(row("Photos").getAttribute("aria-setsize")).toBe("1");
    expect(row("Project 2").getAttribute("aria-level")).toBe("2");
  });

  test("the keyboard walks from one section into the next and skips the headers", () => {
    render(() => <Sectioned />);
    user.tab();
    expect(focusedName()).toBe("Photos");
    press("ArrowDown");
    expect(focusedName()).toBe("Projects");
    press("ArrowDown");
    press("ArrowDown");
    press("ArrowDown");
    expect(focusedName()).toBe("Reports");
    press("ArrowUp");
    press("ArrowUp");
    press("ArrowUp");
    press("ArrowUp");
    expect(focusedName()).toBe("Photos");
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Sectioned />);
    expectNoAriaViolations(container);
  });
});

describe("loading more", () => {
  const LOADING: Folder[] = [
    { id: "photos", name: "Photos" },
    {
      id: "projects",
      name: "Projects",
      children: [
        { id: "project-1", name: "Project 1" },
        { id: "project-loader", name: "Loading projects", kind: "loader" },
      ],
    },
    { id: "project-3", name: "Project 3" },
    { id: "root-loader", name: "Loading", kind: "loader" },
  ];

  function Loading(props: {
    isLoading?: boolean;
    onLoadMore?: () => void;
    items?: Folder[];
    renderEmptyState?: (tree: TreeRenderState) => Child;
  }) {
    return (
      <Tree
        aria-label="Loading"
        items={props.items ?? LOADING}
        defaultExpandedKeys={["projects"]}
        getType={(folder: Folder) => (folder.kind === "loader" ? "loader" : "item")}
        renderEmptyState={props.renderEmptyState}
      >
        {(folder: Folder) =>
          folder.kind === "loader" ? (
            <TreeLoadMoreItem isLoading={props.isLoading} onLoadMore={props.onLoadMore}>
              {folder.name}
            </TreeLoadMoreItem>
          ) : (
            <TreeItem>{folder.name}</TreeItem>
          )
        }
      </Tree>
    );
  }

  test("a loader row states its level and is not counted among its siblings", () => {
    render(() => <Loading isLoading />);
    const all = rows();
    expect(all).toHaveLength(6);
    const nested = all[3] as HTMLElement;
    expect(nested.textContent).toBe("Loading projects");
    expect(nested.getAttribute("aria-level")).toBe("2");
    expect(nested.getAttribute("data-level")).toBe("2");
    expect(nested.hasAttribute("aria-posinset")).toBe(false);
    expect(within(nested).getByRole("gridcell").getAttribute("aria-colindex")).toBe("1");
    expect(row("Project 1").getAttribute("aria-setsize")).toBe("1");
    expect((all[5] as HTMLElement).getAttribute("aria-level")).toBe("1");
  });

  test("the keyboard does not stop on a loader row", () => {
    render(() => <Loading isLoading />);
    user.tab();
    press("ArrowDown");
    press("ArrowDown");
    expect(focusedName()).toBe("Project 1");
    press("ArrowDown");
    expect(focusedName()).toBe("Project 3");
    press("ArrowUp");
    expect(focusedName()).toBe("Project 1");
    press("End");
    expect(focusedName()).toBe("Project 3");
    press("ArrowUp");
    expect(focusedName()).toBe("Project 1");
    press("PageDown");
    expect(focusedName()).toBe("Project 3");
  });

  test("not loading, the sentinel is there and the row is not", () => {
    const { container } = render(() => <Loading />);
    expect(rows()).toHaveLength(4);
    expect(screen.queryByText("Loading")).toBeNull();
    const sentinels = container.querySelectorAll("[data-load-more-sentinel]");
    expect(sentinels).toHaveLength(2);
    expect(sentinels[0]?.closest("[inert]")).not.toBeNull();
  });

  test("the sentinel asks for more when it comes into reach, loading or not", () => {
    const real = globalThis.IntersectionObserver;
    const observers: { callback: IntersectionObserverCallback; targets: Element[] }[] = [];
    globalThis.IntersectionObserver = class {
      readonly targets: Element[] = [];
      constructor(callback: IntersectionObserverCallback) {
        observers.push({ callback, targets: this.targets });
      }
      observe(target: Element): void {
        this.targets.push(target);
      }
      disconnect(): void {
        this.targets.length = 0;
      }
      unobserve(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    } as unknown as typeof IntersectionObserver;

    try {
      let loads = 0;
      const [loading, setLoading] = createSignal(true);
      render(() => (
        <Loading
          items={[
            { id: "photos", name: "Photos" },
            { id: "root-loader", name: "Loading", kind: "loader" },
          ]}
          isLoading={loading()}
          onLoadMore={() => loads++}
        />
      ));
      flush();
      const live = observers.filter((observer) => observer.targets.length > 0);
      expect(live).toHaveLength(1);
      expect(loads).toBe(0);

      const fire = (): void => {
        const observer = observers.findLast((candidate) => candidate.targets.length > 0);
        observer?.callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      };
      fire();
      expect(loads).toBe(1);

      setLoading(false);
      flush();
      fire();
      expect(loads).toBe(2);
    } finally {
      globalThis.IntersectionObserver = real;
    }
  });

  test("an empty tree that is loading shows the loader, not the empty state", () => {
    const [loading, setLoading] = createSignal(true);
    render(() => (
      <Loading
        items={[{ id: "root-loader", name: "Loading", kind: "loader" }]}
        isLoading={loading()}
        renderEmptyState={(_tree: TreeRenderState) => (loading() ? null : "Nothing in tree")}
      />
    ));
    const grid = screen.getByRole("treegrid");
    expect(grid.hasAttribute("data-empty")).toBe(true);
    expect(rows().map((element) => element.textContent)).toEqual(["Loading", ""]);

    setLoading(false);
    flush();
    expect(rows().map((element) => element.textContent)).toEqual(["Nothing in tree"]);
  });
});

describe("a virtualised tree", () => {
  const MANY: Folder[] = Array.from({ length: 200 }, (_, at) => ({
    id: `folder-${at}`,
    name: `Folder ${at}`,
    children: [{ id: `folder-${at}-file`, name: `File ${at}` }],
  }));

  function scrollTo(element: HTMLElement, top: number): void {
    element.style.overflow = "auto";
    Object.defineProperty(element, "clientHeight", { value: 100, configurable: true });
    Object.defineProperty(element, "clientWidth", { value: 200, configurable: true });
    Object.defineProperty(element, "scrollTop", { value: top, writable: true, configurable: true });
    element.dispatchEvent(new Event("scroll"));
    flush();
  }

  test("renders a window of the showing rows and states the whole count", () => {
    render(() => (
      <Virtualizer layout={listLayout({ rowHeight: 20 })}>
        <Tree aria-label="Many" items={MANY} defaultExpandedKeys={["folder-0"]}>
          {(folder: Folder) => <TreeItem>{folder.name}</TreeItem>}
        </Tree>
      </Virtualizer>
    ));
    const grid = screen.getByRole("treegrid");
    scrollTo(grid, 0);

    const drawn = rows();
    expect(drawn.length).toBeLessThan(20);
    expect(grid.getAttribute("aria-rowcount")).toBe("201");
    expect(drawn[1]?.getAttribute("aria-label")).toBe("File 0");
    expect(drawn[1]?.getAttribute("aria-level")).toBe("2");
    expect(drawn[1]?.getAttribute("aria-rowindex")).toBe("2");
    expect(drawn[2]?.getAttribute("aria-rowindex")).toBe("3");
    expect(drawn[0]?.style.position).toBe("absolute");
  });

  test("a loader is placed after the rows, wherever the scroll is", () => {
    const { container } = render(() => (
      <Virtualizer layout={listLayout({ rowHeight: 20 })} overscan={0}>
        <Tree
          aria-label="Many"
          items={[...MANY, { id: "root-loader", name: "Loading", kind: "loader" }]}
          getType={(folder: Folder) => (folder.kind === "loader" ? "loader" : "item")}
        >
          {(folder: Folder) =>
            folder.kind === "loader" ? (
              <TreeLoadMoreItem isLoading>{folder.name}</TreeLoadMoreItem>
            ) : (
              <TreeItem>{folder.name}</TreeItem>
            )
          }
        </Tree>
      </Virtualizer>
    ));
    const grid = screen.getByRole("treegrid");
    scrollTo(grid, 0);

    const loader = rows().at(-1) as HTMLElement;
    expect(loader.textContent).toBe("Loading");
    expect(loader.style.top).toBe("4000px");
    expect(loader.style.height).toBe("20px");
    expect(grid.getAttribute("aria-rowcount")).toBe("200");
    const box = container.querySelector("[data-load-more-sentinel]")?.parentElement;
    expect(box?.style.position).toBe("absolute");
    expect(box?.style.top).toBe("4000px");
  });

  test("a section's header is placed by the layout and its rows follow it", () => {
    render(() => (
      <Virtualizer layout={listLayout({ rowHeight: 20, headingHeight: 30 })}>
        <Tree
          aria-label="Grouped"
          items={[
            {
              id: "recent",
              name: "Recent",
              kind: "section",
              children: [
                { id: "a", name: "Alpha" },
                { id: "b", name: "Beta" },
              ],
            },
          ]}
          getType={(folder: Folder) => (folder.kind === "section" ? "section" : "item")}
        >
          {(folder: Folder) =>
            folder.kind === "section" ? (
              <TreeSection>
                <TreeHeader>{folder.name}</TreeHeader>
              </TreeSection>
            ) : (
              <TreeItem>{folder.name}</TreeItem>
            )
          }
        </Tree>
      </Virtualizer>
    ));
    const grid = screen.getByRole("treegrid");
    scrollTo(grid, 0);

    const group = screen.getByRole("rowgroup");
    expect(accessibleName(group)).toBe("Recent");
    expect(group.style.position).toBe("absolute");
    expect(group.style.height).toBe("30px");
    expect(row("Alpha").style.top).toBe("30px");
    expect(row("Beta").getAttribute("aria-posinset")).toBe("2");
  });

  test("End reaches a row that was never rendered", () => {
    render(() => (
      <Virtualizer layout={listLayout({ rowHeight: 20 })}>
        <Tree aria-label="Many" items={MANY}>
          {(folder: Folder) => <TreeItem>{folder.name}</TreeItem>}
        </Tree>
      </Virtualizer>
    ));
    const grid = screen.getByRole("treegrid");
    scrollTo(grid, 0);
    user.tab();
    press("End");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Folder 199");
  });
});

describe("drag and drop", () => {
  interface DnDProps {
    label?: string;
    items?: Folder[];
    options?: Partial<DragAndDropOptions<Folder>>;
    defaultExpandedKeys?: Iterable<Key>;
    selectionMode?: "none" | "single" | "multiple";
    selectedKeys?: Iterable<Key>;
    disabledKeys?: Iterable<Key>;
    disabledBehavior?: "all" | "selection";
    renderEmptyState?: (tree: TreeRenderState) => Child;
  }

  function Draggable(props: DnDProps) {
    const { dragAndDropHooks } = dragAndDrop<Folder>({
      getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
      ...props.options,
    });
    return (
      <Tree
        aria-label={props.label ?? "Folders"}
        items={props.items ?? FOLDERS}
        defaultExpandedKeys={props.defaultExpandedKeys ?? ALL_EXPANDED}
        selectionMode={props.selectionMode}
        selectedKeys={props.selectedKeys}
        disabledKeys={props.disabledKeys}
        disabledBehavior={props.disabledBehavior}
        renderEmptyState={props.renderEmptyState}
        dragAndDropHooks={dragAndDropHooks}
      >
        {(folder: Folder) => (
          <TreeItem>
            <TreeItemContent>
              {(item: TreeItemRenderState) => (
                <>
                  <DragButton>=</DragButton>
                  {() =>
                    item.hasChildItems() ? (
                      <TreeItemExpandButton>
                        {() => (item.isExpanded() ? "v" : ">")}
                      </TreeItemExpandButton>
                    ) : null
                  }
                  <span>{folder.name}</span>
                </>
              )}
            </TreeItemContent>
          </TreeItem>
        )}
      </Tree>
    );
  }

  const indicator = (target: DropTarget) => (
    <DropIndicator target={target} class="indicator">
      Test
    </DropIndicator>
  );

  /** One key, down and up, with no activation of a focused button. */
  function hit(key: string, options: { altKey?: boolean } = {}): void {
    user.keyDown(key, options);
    user.keyUp(key, options);
  }

  /** Onto the first row, into it onto its drag button, and Enter. */
  async function startDrag(): Promise<void> {
    user.tab();
    hit("ArrowRight");
    expect(document.activeElement?.getAttribute("data-slot")).toBe("drag");
    hit("Enter");
    await nextFrame();
  }

  function rowOf(tree: HTMLElement, key: Key): HTMLElement {
    const found = tree.querySelector(`[role="row"][data-key="${String(key)}"]`);
    if (!(found instanceof HTMLElement)) throw new Error(`no row ${String(key)}`);
    return found;
  }

  function labels(root: ParentNode, selector: string): (string | null)[] {
    return [...root.querySelectorAll(selector)].map((each) =>
      (each.querySelector('[role="button"]') ?? each).getAttribute("aria-label"),
    );
  }

  /** Rows a level apart are 50px apart, top to bottom, among those rendered. */
  function stackRows(): void {
    stubRects(function (this: HTMLElement) {
      const tree = this.closest('[role="treegrid"]');
      if (this.getAttribute("role") === "treegrid" || tree === null) {
        return { left: 0, right: 200, top: 0, bottom: 1000, x: 0, y: 0, width: 200, height: 1000 };
      }
      const rendered = [...tree.querySelectorAll('[role="row"][data-key]')];
      const index = rendered.indexOf(this);
      const top = Math.max(index, 0) * 50;
      return { left: 0, right: 200, top, bottom: top + 50, x: 0, y: top, width: 200, height: 50 };
    });
  }

  afterEach(async () => {
    if (dragSession() !== null) hit("Escape");
    await nextFrame();
    restoreRects();
    clearAnnouncer();
  });

  test("rows offer a drag button named after them, and say they can be dragged", () => {
    render(() => <Draggable />);
    const tree = screen.getByRole("treegrid");
    const projects = rowOf(tree, "projects");
    expect(tree.hasAttribute("data-allows-dragging")).toBe(true);
    expect(projects.hasAttribute("data-allows-dragging")).toBe(true);
    expect(projects.getAttribute("draggable")).toBe("true");
    const handle = within(projects).getByRole("button", { name: "Drag Projects" });
    expect(handle.style.pointerEvents).toBe("none");
  });

  test("a pointer drag starts anywhere on a row by default", async () => {
    const onDragStart = mock();
    render(() => <Draggable options={{ onDragStart }} />);
    const projects = rowOf(screen.getByRole("treegrid"), "projects");
    const dataTransfer = new MockDataTransfer();
    fireDrag(projects, "dragstart", { dataTransfer });
    await nextFrame();
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(projects.hasAttribute("data-dragging")).toBe(true);
    fireDrag(projects, "dragend", { dataTransfer });
    expect(projects.hasAttribute("data-dragging")).toBe(false);
  });

  test("with a handle, only the drag button starts a pointer drag", async () => {
    const onDragStart = mock((_event: { keys: Set<Key> }) => {});
    render(() => <Draggable options={{ pointerDragSource: "handle", onDragStart }} />);
    const projects = rowOf(screen.getByRole("treegrid"), "projects");
    const handle = within(projects).getByRole("button", { name: "Drag Projects" });
    expect(projects.hasAttribute("draggable")).toBe(false);
    expect(handle.getAttribute("draggable")).toBe("true");

    fireDrag(within(projects).getByText("Projects"), "dragstart", {
      dataTransfer: new MockDataTransfer(),
    });
    expect(onDragStart).not.toHaveBeenCalled();

    const dataTransfer = new MockDataTransfer();
    fireDrag(handle, "dragstart", { dataTransfer });
    await nextFrame();
    expect([...(onDragStart.mock.calls[0]?.[0].keys ?? [])]).toEqual(["projects"]);
    expect(projects.hasAttribute("data-dragging")).toBe(true);
    expect(dataTransfer.dragImage?.node).toBe(projects);
    fireDrag(handle, "dragend", { dataTransfer });
    expect(projects.hasAttribute("data-dragging")).toBe(false);
  });

  test("the drag button starts a keyboard drag with a handle too", async () => {
    const onDragStart = mock();
    render(() => <Draggable options={{ pointerDragSource: "handle", onDragStart }} />);
    await startDrag();
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  test("renders drop indicators at the level of the rows beside them, and reorders", async () => {
    const onReorder = mock((_event: DroppableCollectionReorderEvent) => {});
    render(() => <Draggable options={{ onReorder, renderDropIndicator: indicator }} />);
    await startDrag();

    const tree = screen.getByRole("treegrid");
    // A reorder stays among the dragged row's siblings, so only the top level
    // offers places.
    const shown = tree.querySelectorAll(".indicator");
    expect(labels(tree, ".indicator")).toEqual([
      "Insert before Projects",
      "Insert between Projects and Reports",
      "Insert after Reports",
    ]);
    expect(shown[0]?.getAttribute("role")).toBe("row");
    expect(shown[0]?.getAttribute("aria-level")).toBe("1");
    expect(shown[0]?.textContent).toBe("Test");
    expect(shown[1]?.hasAttribute("data-drop-target")).toBe(true);
    expect(focusedName()).toBe("Insert between Projects and Reports");

    hit("ArrowDown");
    expect(focusedName()).toBe("Insert after Reports");
    expect(shown[1]?.hasAttribute("data-drop-target")).toBe(false);
    expect(shown[2]?.hasAttribute("data-drop-target")).toBe(true);

    hit("Enter");
    await nextFrame();
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect([...(onReorder.mock.calls[0]?.[0].keys ?? [])]).toEqual(["projects"]);
    expect(onReorder.mock.calls[0]?.[0].target).toEqual({
      type: "item",
      key: "reports",
      dropPosition: "after",
    });
  });

  test("the end of each branch has an after position of its own, at its level", async () => {
    render(() => (
      <>
        <Draggable label="From" items={[{ id: "salama", name: "Salama" }]} />
        <Draggable label="To" options={{ onInsert: () => {}, renderDropIndicator: indicator }} />
      </>
    ));
    await startDrag();
    const to = screen.getByRole("treegrid", { name: "To" });
    const after = [...to.querySelectorAll(".indicator")]
      .map((each) => [
        each.querySelector('[role="button"]')?.getAttribute("aria-label"),
        each.getAttribute("aria-level"),
      ])
      .filter(([label]) => label?.startsWith("Insert after") === true);
    expect(after).toEqual([
      ["Insert after Project 2C", "3"],
      ["Insert after Project 5C", "3"],
      ["Insert after Project 5", "2"],
      ["Insert after Reports 1ABC", "5"],
      ["Insert after Reports 1AB", "4"],
      ["Insert after Reports 1C", "3"],
      ["Insert after Reports 2", "2"],
      ["Insert after Reports", "1"],
    ]);
  });

  test("does not skip drop positions next to a disabled row", async () => {
    const siblings: Folder[] = [
      { id: "cat", name: "Cat" },
      { id: "dog", name: "Dog" },
      { id: "kangaroo", name: "Kangaroo" },
    ];
    render(() => (
      <Draggable
        items={siblings}
        disabledKeys={["dog"]}
        disabledBehavior="all"
        options={{ onReorder: () => {} }}
      />
    ));
    await startDrag();
    expect(focusedName()).toBe("Insert between Cat and Dog");
    hit("ArrowDown");
    expect(focusedName()).toBe("Insert between Dog and Kangaroo");
    hit("ArrowDown");
    expect(focusedName()).toBe("Insert after Kangaroo");
  });

  test("drops on a row of another tree", async () => {
    const onItemDrop = mock();
    render(() => (
      <>
        <Draggable label="From" />
        <Draggable label="To" options={{ onItemDrop }} />
      </>
    ));
    await startDrag();

    const to = screen.getByRole("treegrid", { name: "To" });
    expect(labels(to, '[role="button"][aria-label^="Drop on"]').slice(0, 3)).toEqual([
      "Drop on Projects",
      "Drop on Project 1",
      "Drop on Project 2",
    ]);
    expect(rowOf(to, "projects").hasAttribute("data-drop-target")).toBe(true);
    expect(rowOf(to, "project-1").hasAttribute("data-drop-target")).toBe(false);
    expect(focusedName()).toBe("Drop on Projects");

    hit("Enter");
    await nextFrame();
    expect(onItemDrop).toHaveBeenCalledTimes(1);
    expect(onItemDrop.mock.calls[0]?.[0]).toMatchObject({
      isInternal: false,
      target: { type: "item", key: "projects", dropPosition: "on" },
    });
  });

  test("drops on another tree itself", async () => {
    const onRootDrop = mock();
    render(() => (
      <>
        <Draggable label="From" />
        <Draggable label="To" options={{ onRootDrop }} />
      </>
    ));
    await startDrag();

    const to = screen.getByRole("treegrid", { name: "To" });
    const active = document.activeElement as HTMLElement;
    expect(to.contains(active)).toBe(true);
    expect(active.getAttribute("aria-label")).toBe("Drop on");
    expect(active.getAttribute("aria-labelledby")).toBe(`${active.id} ${to.id}`);
    expect(to.hasAttribute("data-drop-target")).toBe(true);

    hit("Enter");
    await nextFrame();
    expect(onRootDrop).toHaveBeenCalledTimes(1);
    expect(to.hasAttribute("data-drop-target")).toBe(false);
  });

  test("a row cannot be dropped into its own branch", async () => {
    render(() => <Draggable options={{ onMove: () => {} }} />);
    await startDrag();
    const tree = screen.getByRole("treegrid");
    const offered = labels(tree, '[role="button"][aria-label^="Drop on"]');
    expect(offered).not.toContain("Drop on Projects");
    expect(offered).not.toContain("Drop on Project 1");
    expect(offered).not.toContain("Drop on Project 2A");
    expect(offered).toContain("Drop on Reports");
    expect(offered).toContain("Drop on Reports 1ABC");
  });

  test("Right on a collapsed row opens it mid-drag, and Left closes it", async () => {
    const onDropActivate = mock();
    render(() => (
      <>
        <Draggable label="From" items={[{ id: "salama", name: "Salama" }]} />
        <Draggable
          label="To"
          defaultExpandedKeys={[]}
          options={{ onItemDrop: () => {}, onDropActivate }}
        />
      </>
    ));
    await startDrag();
    const to = screen.getByRole("treegrid", { name: "To" });
    expect(focusedName()).toBe("Drop on Projects");
    expect(to.querySelector('[data-key="project-1"]')).toBeNull();

    hit("ArrowRight");
    await nextFrame();
    expect(rowOf(to, "projects").getAttribute("aria-expanded")).toBe("true");
    expect(focusedName()).toBe("Drop on Projects");
    hit("ArrowDown");
    await nextFrame();
    expect(focusedName()).toBe("Drop on Project 1");

    hit("ArrowUp");
    hit("ArrowLeft");
    await nextFrame();
    expect(rowOf(to, "projects").getAttribute("aria-expanded")).toBe("false");
    expect(onDropActivate).not.toHaveBeenCalled();
  });

  test("Alt + Enter and the activate button open a row mid-drag", async () => {
    const onDropActivate = mock();
    render(() => (
      <>
        <Draggable label="From" items={[{ id: "salama", name: "Salama" }]} />
        <Draggable
          label="To"
          defaultExpandedKeys={[]}
          options={{ onItemDrop: () => {}, onDropActivate }}
        />
      </>
    ));
    await startDrag();
    const to = screen.getByRole("treegrid", { name: "To" });
    const projects = rowOf(to, "projects");

    const activate = to.querySelector('[role="button"][aria-label="Expand"]');
    expect(activate?.getAttribute("aria-labelledby")).toBe(`${activate?.id} ${projects.id}`);
    expect(activate?.getAttribute("tabindex")).toBe("-1");

    hit("Enter", { altKey: true });
    await nextFrame();
    expect(projects.getAttribute("aria-expanded")).toBe("true");
    expect(onDropActivate.mock.calls[0]?.[0]).toMatchObject({
      type: "dropactivate",
      target: { type: "item", key: "projects", dropPosition: "on" },
    });

    // A screen reader's click on the activate button may close it again.
    const collapse = to.querySelector('[role="button"][aria-label="Collapse"]');
    if (!(collapse instanceof HTMLElement)) throw new Error("no activate button");
    user.virtualClick(collapse);
    await nextFrame();
    expect(projects.getAttribute("aria-expanded")).toBe("false");
  });

  test("a pointer drag held over a collapsed row opens it", async () => {
    stackRows();
    render(() => (
      <>
        <Draggable label="From" items={[{ id: "salama", name: "Salama" }]} />
        <Draggable label="To" defaultExpandedKeys={[]} options={{ onItemDrop: () => {} }} />
      </>
    ));
    const from = screen.getByRole("treegrid", { name: "From" });
    const to = screen.getByRole("treegrid", { name: "To" });
    const dataTransfer = new MockDataTransfer();
    fireDrag(rowOf(from, "salama"), "dragstart", { dataTransfer });
    fireDrag(to, "dragenter", { dataTransfer, clientX: 100, clientY: 25 });
    fireDrag(to, "dragover", { dataTransfer, clientX: 100, clientY: 26 });
    expect(rowOf(to, "projects").hasAttribute("data-drop-target")).toBe(true);
    expect(rowOf(to, "projects").getAttribute("aria-expanded")).toBe("false");

    await new Promise((resolve) => setTimeout(resolve, 850));
    flush();
    expect(rowOf(to, "projects").getAttribute("aria-expanded")).toBe("true");
    fireDrag(rowOf(from, "salama"), "dragend", { dataTransfer });
  });

  test("a pointer drag drops between rows at the level the point says", async () => {
    stackRows();
    const onInsert = mock();
    render(() => (
      <>
        <Draggable label="From" items={[{ id: "salama", name: "Salama" }]} />
        <Draggable
          label="To"
          defaultExpandedKeys={["projects"]}
          options={{ onInsert, renderDropIndicator: indicator }}
        />
      </>
    ));
    const from = screen.getByRole("treegrid", { name: "From" });
    const to = screen.getByRole("treegrid", { name: "To" });
    const dataTransfer = new MockDataTransfer();
    fireDrag(rowOf(from, "salama"), "dragstart", { dataTransfer });

    // The bottom edge of Projects, which is open: before its first child.
    fireDrag(to, "dragenter", { dataTransfer, clientX: 100, clientY: 48 });
    fireDrag(to, "dragover", { dataTransfer, clientX: 100, clientY: 49 });
    expect(
      to
        .querySelector(".indicator[data-drop-target]")
        ?.querySelector('[role="button"]')
        ?.getAttribute("aria-label"),
    ).toBe("Insert before Project 1");

    fireDrag(to, "drop", { dataTransfer, clientX: 100, clientY: 49 });
    expect(onInsert.mock.calls[0]?.[0]).toMatchObject({
      target: { type: "item", key: "project-1", dropPosition: "before" },
    });
    fireDrag(rowOf(from, "salama"), "dragend", { dataTransfer });
  });

  test("a selected parent drags without its selected descendants", () => {
    const getItems = mock((keys: Set<Key>) =>
      [...keys].map((key) => ({ "text/plain": String(key) })),
    );
    render(() => (
      <Draggable
        selectionMode="multiple"
        selectedKeys={["projects", "project-1", "reports", "reports-1AB", "reports-2"]}
        options={{ getItems }}
      />
    ));
    const projects = rowOf(screen.getByRole("treegrid"), "projects");
    expect(projects.getAttribute("aria-selected")).toBe("true");
    const dataTransfer = new MockDataTransfer();
    fireDrag(projects, "dragstart", { dataTransfer });
    fireDrag(projects, "dragend", { dataTransfer });
    expect(getItems).toHaveBeenCalledTimes(1);
    expect([...(getItems.mock.calls[0]?.[0] ?? [])].toSorted(byKey)).toEqual([
      "projects",
      "reports",
    ]);
  });

  test("a screen reader's click starts the drag on the button and drops on a target", async () => {
    const onItemDrop = mock((_event: DroppableCollectionOnItemDropEvent) => {});
    render(() => (
      <>
        <Draggable label="From" />
        <Draggable label="To" options={{ onItemDrop }} />
      </>
    ));
    const from = screen.getByRole("treegrid", { name: "From" });
    const to = screen.getByRole("treegrid", { name: "To" });
    user.virtualClick(
      within(rowOf(from, "projects")).getByRole("button", { name: "Drag Projects" }),
    );
    await nextFrame();
    expect(rowOf(from, "projects").hasAttribute("data-dragging")).toBe(true);

    const target = to.querySelector('[role="button"][aria-label="Drop on Reports"]');
    if (!(target instanceof HTMLElement)) throw new Error("no target");
    user.virtualClick(target);
    await nextFrame();
    expect(onItemDrop.mock.calls[0]?.[0]).toMatchObject({
      target: { type: "item", key: "reports", dropPosition: "on" },
    });
    const item = onItemDrop.mock.calls[0]?.[0].items[0];
    if (item === undefined || !isTextDropItem(item)) throw new Error("expected text");
    expect(await item.getText("text/plain")).toBe("projects");
  });

  test("a disabled drag and drop makes nothing draggable, and selection still works", () => {
    render(() => <Draggable selectionMode="multiple" options={{ isDisabled: true }} />);
    const tree = screen.getByRole("treegrid");
    expect(tree.hasAttribute("data-allows-dragging")).toBe(false);
    for (const each of tree.querySelectorAll('[role="row"][data-key]')) {
      expect(each.hasAttribute("draggable")).toBe(false);
    }
    const handle = within(rowOf(tree, "projects")).getByRole("button", { name: "Drag Projects" });
    expect((handle as HTMLButtonElement).disabled).toBe(true);

    user.click(rowOf(tree, "projects"));
    expect(rowOf(tree, "projects").getAttribute("aria-selected")).toBe("true");
  });

  test("what a drop inserts is focused and selected", async () => {
    const [arrived, setArrived] = createSignal<Folder[]>([]);
    render(() => (
      <>
        <Draggable label="From" items={[{ id: "salama", name: "Salama" }]} />
        <Draggable
          label="To"
          selectionMode="multiple"
          items={arrived()}
          renderEmptyState={(state: TreeRenderState) => (
            <span data-testid="empty" data-drop={String(state.isDropTarget())}>
              Nothing here
            </span>
          )}
          options={{
            onRootDrop: () => {
              setArrived([{ id: "acme", name: "Acme" }]);
            },
          }}
        />
      </>
    ));
    await startDrag();
    const to = screen.getByRole("treegrid", { name: "To" });
    expect(focusedName()).toBe("Drop on");
    expect(screen.getByTestId("empty").getAttribute("data-drop")).toBe("true");
    hit("Enter");
    await nextFrame();
    await new Promise((resolve) => setTimeout(resolve, 60));
    flush();
    const acme = rowOf(to, "acme");
    expect(document.activeElement).toBe(acme);
    expect(acme.getAttribute("aria-selected")).toBe("true");
  });
});

describe("selection announcements", () => {
  beforeEach(() => destroyAnnouncer());
  afterEach(() => {
    destroyAnnouncer();
    Reflect.deleteProperty(window, "ontouchstart");
  });

  async function said(): Promise<string | undefined> {
    await nextFrame();
    return announcements().at(-1);
  }

  test("a row selected and deselected is named, and the count follows past one", async () => {
    render(() => <Files selectionMode="multiple" withControls />);
    const box = (name: string): HTMLElement => within(row(name)).getByRole("checkbox");
    user.click(box("Projects"));
    flush();
    expect(await said()).toBe("Projects selected.");
    user.click(box("Project 1"));
    flush();
    expect(await said()).toBe("Project 1 selected. 2 items selected.");
    user.click(box("Projects"));
    flush();
    expect(await said()).toBe("Projects not selected. 1 item selected.");
    user.click(box("Project 1"));
    flush();
    expect(await said()).toBe("Project 1 not selected.");
    expect(announcements()).toHaveLength(4);
  });

  test("select all covers the tree and is announced", async () => {
    render(() => <Files selectionMode="multiple" />);
    user.click(row("Projects"));
    flush();
    user.key("a", { ctrlKey: true, metaKey: true });
    flush();
    expect(await said()).toBe("All items selected.");
  });

  test("arrowing through a replace tree names the row it selects", async () => {
    render(() => <Files selectionMode="multiple" selectionBehavior="replace" />);
    user.click(row("Projects"));
    flush();
    expect(await said()).toBe("Projects selected.");
    press("ArrowDown");
    expect(await said()).toBe("Project 1 selected.");
    expect(announcements()).toHaveLength(2);
  });

  test("on a touch device a tree whose tap is an action describes the long press", () => {
    Object.defineProperty(window, "ontouchstart", { value: null, configurable: true });
    render(() => (
      <Files selectionMode="multiple" selectionBehavior="replace" onAction={() => {}} />
    ));
    const ids = screen.getByRole("treegrid").getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toContain(
      "Long press to enter selection mode.",
    );
  });
});
