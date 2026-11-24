import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { type Child, flush, createSignal, provide } from "@barqjs/core";
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
  DragButton,
  dragAndDrop,
  type DragAndDropOptions,
  DropIndicator,
} from "./drag-and-drop.tsx";
import { dragSession, type DroppableCollectionReorderEvent, type DropTarget } from "./dnd/index.ts";
import {
  GridList,
  GridListHeader,
  GridListItem,
  GridListLoadMoreItem,
  type GridListRenderState,
  GridListSection,
  GridListSelectionCheckbox,
} from "./gridlist.tsx";
import { RouterContext } from "./interactions/open-link.ts";
import { provideLocale } from "./i18n.ts";
import { clearAnnouncer, destroyAnnouncer } from "./live.ts";
import { SelectionIndicator } from "./selection-indicator.tsx";
import { announcements, fireDrag, MockDataTransfer, nextFrame } from "./test-dnd.ts";
import { stubIntersections } from "./test-load-more.ts";
import { listLayout, Virtualizer } from "./virtualizer.tsx";

interface File {
  id: string;
  name: string;
  isDisabled?: boolean;
}

const FILES: File[] = [
  { id: "notes", name: "Notes" },
  { id: "budget", name: "Budget" },
  { id: "archive", name: "Archive", isDisabled: true },
  { id: "photos", name: "Photos" },
];

function Files(props: {
  selectionMode?: "none" | "single" | "multiple";
  keyboardNavigationBehavior?: "arrow" | "tab";
  onSelectionChange?: (keys: "all" | Set<Key>) => void;
  onAction?: (key: Key) => void;
  withButtons?: boolean;
}) {
  return (
    <GridList
      aria-label="Files"
      items={FILES}
      selectionMode={props.selectionMode ?? "none"}
      keyboardNavigationBehavior={props.keyboardNavigationBehavior}
      onSelectionChange={props.onSelectionChange}
      onAction={props.onAction}
      getTextValue={(file: File) => file.name}
    >
      {(file: File) => (
        <GridListItem>
          <span>{file.name}</span>
          {() =>
            props.withButtons === true ? (
              <>
                <Button>Rename {file.name}</Button>
                <Button>Delete {file.name}</Button>
              </>
            ) : null
          }
        </GridListItem>
      )}
    </GridList>
  );
}

function rows(): HTMLElement[] {
  return screen.getAllByRole("row");
}

describe("GridList", () => {
  test("is a named grid of rows holding cells", () => {
    render(() => <Files />);

    const grid = screen.getByRole("grid");
    expect(accessibleName(grid)).toBe("Files");
    expect(rows()).toHaveLength(4);
    expect(screen.getAllByRole("gridcell")).toHaveLength(4);
  });

  test("a row that cannot be selected does not claim to be unselected", () => {
    render(() => <Files />);
    for (const row of rows()) {
      expect(row.hasAttribute("aria-selected")).toBe(false);
    }
  });

  test("multiple selection says so and every row reports itself", () => {
    render(() => <Files selectionMode="multiple" />);

    expect(screen.getByRole("grid").getAttribute("aria-multiselectable")).toBe("true");
    expect(rows()[0]?.getAttribute("aria-selected")).toBe("false");
  });

  test("clicking a row selects it", () => {
    const selections: string[][] = [];
    render(() => (
      <Files
        selectionMode="multiple"
        onSelectionChange={(keys) =>
          selections.push(keys === "all" ? ["all"] : [...keys].map(String))
        }
      />
    ));

    user.click(rows()[1] as HTMLElement);
    flush();

    expect(selections).toEqual([["budget"]]);
  });

  test("a disabled row cannot be selected", () => {
    const selections: string[][] = [];
    render(() => (
      <Files
        selectionMode="multiple"
        onSelectionChange={(keys) =>
          selections.push(keys === "all" ? ["all"] : [...keys].map(String))
        }
      />
    ));

    expect(rows()[2]?.getAttribute("aria-disabled")).toBe("true");
    user.click(rows()[2] as HTMLElement);
    flush();

    expect(selections).toEqual([]);
  });

  test("the grid is ONE Tab stop and the arrows move between rows", () => {
    render(() => <Files />);

    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("tabindex")).toBe("0");

    user.focus(grid);
    expect(document.activeElement).toBe(rows()[0] as HTMLElement);

    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(rows()[1] as HTMLElement);

    // Archive is disabled, so Down lands on Photos.
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(rows()[3] as HTMLElement);
  });

  test("the arrows move WITHIN a row, and back out to it", () => {
    render(() => <Files withButtons />);

    const row = rows()[0] as HTMLElement;
    user.focus(row);

    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement?.textContent).toBe("Rename Notes");

    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement?.textContent).toBe("Delete Notes");

    // Off the end: back to the row, which is where up and down work from.
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(row);
  });

  test("down from inside a row still moves to the next row", () => {
    render(() => <Files withButtons />);

    user.focus(rows()[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement?.textContent).toBe("Rename Notes");

    // The button would otherwise be the one to see this key.
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(rows()[1] as HTMLElement);
  });

  test("an action fires for the row that was pressed", () => {
    const acted: Key[] = [];
    render(() => <Files onAction={(key) => acted.push(key)} />);

    user.click(rows()[1] as HTMLElement);
    flush();

    expect(acted).toEqual(["budget"]);
  });

  test("typing jumps to a matching row", () => {
    render(() => <Files />);

    user.focus(screen.getByRole("grid"));
    user.keyDown("p");
    flush();

    expect(document.activeElement).toBe(rows()[3] as HTMLElement);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Files selectionMode="multiple" withButtons />);
    expectNoAriaViolations(container);
  });
});

describe("an action that arrives after the rows were built", () => {
  test("a row picks up an onAction the list did not have at construction", () => {
    const acted: Key[] = [];
    const [enabled, setEnabled] = createSignal(false);

    render(() => (
      <GridList
        aria-label="Files"
        items={FILES}
        selectionMode="none"
        onAction={enabled() ? (key: Key) => acted.push(key) : undefined}
        getTextValue={(file: File) => file.name}
      >
        {(file: File) => <GridListItem>{file.name}</GridListItem>}
      </GridList>
    ));

    user.click(screen.getByRole("row", { name: "Notes" }));
    expect(acted, "an action ran before one was declared").toEqual([]);

    setEnabled(true);
    flush();

    user.click(screen.getByRole("row", { name: "Notes" }));
    expect(acted, "the row is still reading the action it saw at construction").toEqual(["notes"]);
  });
});

describe("drag and drop", () => {
  interface Animal {
    id: string;
    name: string;
  }

  const ANIMALS: Animal[] = [
    { id: "cat", name: "Cat" },
    { id: "dog", name: "Dog" },
    { id: "kangaroo", name: "Kangaroo" },
  ];

  function Animals(props: {
    label?: string;
    labelledBy?: string;
    options?: Partial<DragAndDropOptions<Animal>>;
    disabledKeys?: Key[];
  }) {
    const { dragAndDropHooks } = dragAndDrop<Animal>({
      getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
      ...props.options,
    });
    return (
      <GridList
        aria-label={props.labelledBy === undefined ? (props.label ?? "Animals") : undefined}
        aria-labelledby={props.labelledBy}
        items={ANIMALS}
        getTextValue={(animal: Animal) => animal.name}
        disabledKeys={props.disabledKeys}
        dragAndDropHooks={dragAndDropHooks}
      >
        {(animal: Animal) => (
          <GridListItem>
            <DragButton>≡</DragButton>
            <span>{animal.name}</span>
          </GridListItem>
        )}
      </GridList>
    );
  }

  const indicator = (target: DropTarget) => (
    <DropIndicator target={target} class="indicator">
      Test
    </DropIndicator>
  );

  function press(key: string) {
    user.keyDown(key);
    user.keyUp(key);
  }

  /** Into the first row, onto its drag button, and Enter. */
  async function startDrag() {
    user.tab();
    press("ArrowRight");
    expect(document.activeElement?.getAttribute("data-slot")).toBe("drag");
    press("Enter");
    await nextFrame();
  }

  function indicatorLabels(grid: HTMLElement): (string | null)[] {
    return [...grid.querySelectorAll(".indicator")].map(
      (row) => row.querySelector('[role="button"]')?.getAttribute("aria-label") ?? null,
    );
  }

  afterEach(async () => {
    if (dragSession() !== null) press("Escape");
    await nextFrame();
    clearAnnouncer();
  });

  test("a row drags from anywhere, and its drag button starts a keyboard drag", () => {
    render(() => <Animals />);
    const cat = rows()[0] as HTMLElement;
    expect(cat.getAttribute("draggable")).toBe("true");
    expect(cat.hasAttribute("data-allows-dragging")).toBe(true);
    const handle = within(cat).getByRole("button", { name: "Drag Cat" });
    expect(handle.style.pointerEvents).toBe("none");
  });

  test("a DragButton outside a draggable row is refused", () => {
    expect(() => render(() => <DragButton>≡</DragButton>)).toThrow();
  });

  test("renders drop indicators and reorders from the keyboard", async () => {
    const onReorder = mock((_event: DroppableCollectionReorderEvent) => {});
    render(() => <Animals options={{ onReorder, renderDropIndicator: indicator }} />);
    await startDrag();

    const grid = screen.getByRole("grid");
    expect(indicatorLabels(grid)).toEqual([
      "Insert before Cat",
      "Insert between Cat and Dog",
      "Insert between Dog and Kangaroo",
      "Insert after Kangaroo",
    ]);
    const indicators = [...grid.querySelectorAll(".indicator")];
    expect(indicators[0]?.getAttribute("role")).toBe("row");
    expect(indicators[0]?.textContent).toBe("Test");
    expect(indicators[1]?.hasAttribute("data-drop-target")).toBe(true);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Insert between Cat and Dog");

    press("ArrowDown");
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Insert between Dog and Kangaroo",
    );
    expect(indicators[1]?.hasAttribute("data-drop-target")).toBe(false);
    expect(indicators[2]?.hasAttribute("data-drop-target")).toBe(true);

    press("Enter");
    await nextFrame();
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect([...(onReorder.mock.calls[0]?.[0].keys ?? [])]).toEqual(["cat"]);
    expect(onReorder.mock.calls[0]?.[0].target).toEqual({
      type: "item",
      key: "kangaroo",
      dropPosition: "before",
    });
  });

  test("does not skip drop positions next to a disabled row", async () => {
    render(() => <Animals disabledKeys={["dog"]} options={{ onReorder: () => {} }} />);
    await startDrag();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Insert between Cat and Dog");
    press("ArrowDown");
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Insert between Dog and Kangaroo",
    );
    press("ArrowDown");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Insert after Kangaroo");
  });

  test("drops on a row of another list", async () => {
    const onItemDrop = mock();
    render(() => (
      <>
        <Animals label="From" />
        <Animals label="To" options={{ onItemDrop }} />
      </>
    ));
    await startDrag();

    const to = screen.getByRole("grid", { name: "To" });
    const targets = [...to.querySelectorAll('[role="button"][aria-label^="Drop on"]')];
    expect(targets.map((target) => target.getAttribute("aria-label"))).toEqual([
      "Drop on Cat",
      "Drop on Dog",
      "Drop on Kangaroo",
    ]);
    const catRow = within(to)
      .getAllByRole("row")
      .find((row) => row.dataset.key === "cat");
    expect(catRow?.hasAttribute("data-drop-target")).toBe(true);
    expect(document.activeElement).toBe(targets[0] as HTMLElement);

    press("Enter");
    await nextFrame();
    expect(onItemDrop).toHaveBeenCalledTimes(1);
    expect(onItemDrop.mock.calls[0]?.[0]).toMatchObject({
      target: { type: "item", key: "cat", dropPosition: "on" },
      isInternal: false,
    });
  });

  test("drops on another list itself", async () => {
    const onRootDrop = mock();
    render(() => (
      <>
        <Animals label="From" />
        <Animals label="To" options={{ onRootDrop }} />
      </>
    ));
    await startDrag();

    const to = screen.getByRole("grid", { name: "To" });
    const active = document.activeElement as HTMLElement;
    expect(to.contains(active)).toBe(true);
    expect(active.getAttribute("aria-label")).toBe("Drop on");
    expect(active.getAttribute("aria-labelledby")).toBe(`${active.id} ${to.id}`);
    expect(to.hasAttribute("data-drop-target")).toBe(true);

    press("Enter");
    await nextFrame();
    expect(onRootDrop).toHaveBeenCalledTimes(1);
  });

  test("a drop on a list named by a heading is named by that heading", async () => {
    render(() => (
      <>
        <Animals label="From" />
        <h3 id="to-heading">To</h3>
        <Animals labelledBy="to-heading" options={{ onRootDrop: () => {} }} />
      </>
    ));
    await startDrag();

    const active = document.activeElement as HTMLElement;
    expect(active.getAttribute("aria-label")).toBe("Drop on");
    expect(active.getAttribute("aria-labelledby")).toBe(`${active.id} to-heading`);
  });

  test("with a handle, only the drag button starts a pointer drag", async () => {
    const onDragStart = mock();
    render(() => <Animals options={{ pointerDragSource: "handle", onDragStart }} />);
    const cat = rows()[0] as HTMLElement;
    const handle = within(cat).getByRole("button", { name: "Drag Cat" });
    expect(cat.hasAttribute("draggable")).toBe(false);
    expect(handle.getAttribute("draggable")).toBe("true");

    const fromText = new MockDataTransfer();
    fireDrag(within(cat).getByText("Cat"), "dragstart", { dataTransfer: fromText });
    expect(onDragStart).not.toHaveBeenCalled();

    const dataTransfer = new MockDataTransfer();
    fireDrag(handle, "dragstart", { dataTransfer });
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(dataTransfer.entries()).toEqual([{ type: "text/plain", data: "cat" }]);
    // The whole row is photographed, not only the button.
    expect(dataTransfer.dragImage?.node).toBe(cat);
    fireDrag(handle, "dragend", { dataTransfer });
  });

  test("the drag button starts a keyboard drag with a handle too", async () => {
    const onDragStart = mock();
    render(() => <Animals options={{ pointerDragSource: "handle", onDragStart }} />);
    await startDrag();
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(rows()[0]?.hasAttribute("data-dragging")).toBe(true);
  });
});

describe("tab navigation keeps a row's controls to themselves", () => {
  function Editable(props: { onSelectionChange?: (keys: "all" | Set<Key>) => void }) {
    return (
      <GridList
        aria-label="Files"
        items={FILES}
        keyboardNavigationBehavior="tab"
        selectionMode="multiple"
        onSelectionChange={props.onSelectionChange}
        getTextValue={(file: File) => file.name}
      >
        {(file: File) => (
          <GridListItem>
            <input aria-label={`Name of ${file.name}`} />
            <Button>Delete {file.name}</Button>
          </GridListItem>
        )}
      </GridList>
    );
  }

  test("typing in a field inside a row is not a typeahead", () => {
    render(() => <Editable />);
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Name of Notes" });
    user.focus(input);
    user.key("b");
    flush();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("b");
  });

  test("Home, Ctrl+A, Space and the arrows inside a field stay with the field", () => {
    const selections: string[][] = [];
    render(() => (
      <Editable
        onSelectionChange={(keys) =>
          selections.push(keys === "all" ? ["all"] : [...keys].map(String))
        }
      />
    ));
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Name of Notes" });
    user.focus(input);

    expect(user.keyDown("Home")).toBe(true);
    expect(user.keyDown("a", { ctrlKey: true, metaKey: true })).toBe(true);
    expect(user.keyDown("ArrowDown")).toBe(true);
    user.key(" ");
    flush();
    expect(document.activeElement).toBe(input);
    expect(selections).toEqual([]);
  });

  test("Tab still moves between the row's controls and out of the list", () => {
    render(() => (
      <>
        <Editable />
        <button type="button">After</button>
      </>
    ));
    user.tab();
    expect(document.activeElement).toBe(rows()[0] as HTMLElement);
    user.tab();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Name of Notes");
    user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete Notes" }));
  });

  test("the arrows on the row itself still move between rows", () => {
    render(() => <Editable />);
    user.focus(rows()[0] as HTMLElement);
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(rows()[1] as HTMLElement);
  });

  test("allowsArrowNavigation lets the arrows move rows from a control", () => {
    render(() => (
      <GridList aria-label="Files" items={FILES} keyboardNavigationBehavior="tab">
        {(file: File) => (
          <GridListItem allowsArrowNavigation>
            <Button>Open {file.name}</Button>
          </GridListItem>
        )}
      </GridList>
    ));
    user.focus(screen.getByRole("button", { name: "Open Notes" }));
    flush();
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(rows()[1] as HTMLElement);
  });

  test("focusMode child hands the row's focus to its first control", async () => {
    render(() => (
      <GridList aria-label="Files" items={FILES} keyboardNavigationBehavior="tab">
        {(file: File) => (
          <GridListItem focusMode="child">
            <Button>Open {file.name}</Button>
          </GridListItem>
        )}
      </GridList>
    ));
    user.tab();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    flush();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open Notes" }));
  });
});

describe("pointer focus inside a row", () => {
  test("pressing a field or a button inside a row leaves focus on it", () => {
    render(() => (
      <GridList aria-label="Files" items={FILES} selectionMode="multiple">
        {(file: File) => (
          <GridListItem>
            <input aria-label={`Name of ${file.name}`} />
            <Button>Delete {file.name}</Button>
          </GridListItem>
        )}
      </GridList>
    ));

    const input = screen.getByRole("textbox", { name: "Name of Budget" });
    user.click(input);
    flush();
    expect(document.activeElement).toBe(input);

    const remove = screen.getByRole("button", { name: "Delete Photos" });
    user.click(remove);
    flush();
    expect(document.activeElement).toBe(remove);
    expect(rows()[3]?.getAttribute("aria-selected")).toBe("false");
  });
});

describe("keys and layout", () => {
  test("Page Down and Page Up reach the ends of a list that does not scroll", () => {
    render(() => <Files />);
    user.focus(screen.getByRole("grid"));
    user.keyDown("PageDown");
    flush();
    expect(document.activeElement).toBe(rows()[3] as HTMLElement);
    user.keyDown("PageUp");
    flush();
    expect(document.activeElement).toBe(rows()[0] as HTMLElement);
  });

  test("the grid writes its layout, orientation, focus and selection mode", () => {
    render(() => <Files selectionMode="multiple" />);
    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("data-layout")).toBe("stack");
    expect(grid.getAttribute("data-orientation")).toBe("vertical");
    expect(rows()[0]?.getAttribute("data-selection-mode")).toBe("multiple");
  });

  test("a horizontal list under tab navigation moves between rows with Left and Right", () => {
    render(() => (
      <GridList
        aria-label="Files"
        items={FILES}
        orientation="horizontal"
        keyboardNavigationBehavior="tab"
      >
        {(file: File) => <GridListItem>{file.name}</GridListItem>}
      </GridList>
    ));
    expect(screen.getByRole("grid").getAttribute("data-orientation")).toBe("horizontal");
    user.focus(rows()[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(rows()[1] as HTMLElement);
  });

  test("a grid layout uses tab navigation and moves across rows with the arrows", () => {
    render(() => (
      <GridList aria-label="Files" items={FILES} layout="grid">
        {(file: File) => (
          <GridListItem>
            {file.name}
            <Button>Open {file.name}</Button>
          </GridListItem>
        )}
      </GridList>
    ));
    expect(screen.getByRole("grid").getAttribute("data-layout")).toBe("grid");
    user.focus(rows()[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(rows()[1] as HTMLElement);
  });

  test("a row in focus has data-focus-visible-within while a control in it has the ring", () => {
    render(() => <Files withButtons />);
    user.tab();
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement?.textContent).toBe("Rename Notes");
    expect(rows()[0]?.hasAttribute("data-focus-visible-within")).toBe(true);
    expect(rows()[1]?.hasAttribute("data-focus-visible-within")).toBe(false);
  });

  test("a row keeps the id its key gives it, which its checkbox names", () => {
    render(() => (
      <GridList aria-label="Files" items={FILES} selectionMode="multiple">
        {(file: File) => (
          <GridListItem id={`mine-${file.id}`}>
            <GridListSelectionCheckbox />
            {file.name}
          </GridListItem>
        )}
      </GridList>
    ));
    expect(rows()[0]?.id).not.toBe("mine-notes");
    expect(screen.getByRole("checkbox", { name: "Select Notes" })).not.toBeNull();
  });

  test("a row's id is a single token even when its key is not", () => {
    render(() => (
      <GridList aria-label="Cities" items={[{ id: "New York", name: "New York" }]}>
        {(city: { name: string }) => <GridListItem>{city.name}</GridListItem>}
      </GridList>
    ));
    expect(rows()[0]?.id).toMatch(/^[A-Za-z][\w:.-]*$/);
  });

  test("an empty list renders its empty state and stays a Tab stop", () => {
    render(() => (
      <GridList
        aria-label="Files"
        items={[] as File[]}
        renderEmptyState={(grid) => <span>No files {grid.isEmpty() ? "yet" : ""}</span>}
      >
        {(file: File) => <GridListItem>{file.name}</GridListItem>}
      </GridList>
    ));
    const grid = screen.getByRole("grid");
    expect(grid.textContent).toBe("No files yet");
    expect(grid.getAttribute("tabindex")).toBe("0");
    user.tab();
    expect(document.activeElement).toBe(grid);
    expect(grid.hasAttribute("data-focus-visible")).toBe(true);
  });

  test("an empty state with a control of its own takes the Tab stop from the grid", () => {
    render(() => (
      <GridList
        aria-label="Files"
        items={[] as File[]}
        renderEmptyState={(_grid: GridListRenderState) => <button type="button">Upload</button>}
      >
        {(file: File) => <GridListItem>{file.name}</GridListItem>}
      </GridList>
    ));
    flush();
    expect(screen.getByRole("grid").getAttribute("tabindex")).toBe("-1");
    user.tab();
    expect(document.activeElement?.textContent).toBe("Upload");
  });

  test("shouldSelectOnPressUp selects on release", () => {
    const selections: string[][] = [];
    render(() => (
      <GridList
        aria-label="Files"
        items={FILES}
        selectionMode="single"
        shouldSelectOnPressUp
        onSelectionChange={(keys) =>
          selections.push(keys === "all" ? ["all"] : [...keys].map(String))
        }
      >
        {(file: File) => <GridListItem>{file.name}</GridListItem>}
      </GridList>
    ));
    user.pointerDown(rows()[1] as HTMLElement);
    flush();
    expect(selections).toEqual([]);
    user.pointerUp(rows()[1] as HTMLElement);
    user.click(rows()[1] as HTMLElement);
    flush();
    expect(selections).toEqual([["budget"]]);
  });
});

describe("item events and actions", () => {
  test("a row's own onAction runs before the list's, and its press events reach it", () => {
    const seen: string[] = [];
    render(() => (
      <GridList aria-label="Files" items={FILES} onAction={(key: Key) => seen.push(`list ${key}`)}>
        {(file: File) => (
          <GridListItem
            onAction={() => seen.push(`own ${file.id}`)}
            onPressStart={() => seen.push("press start")}
            onPress={() => seen.push("press")}
            onHoverStart={() => seen.push("hover")}
          >
            {file.name}
          </GridListItem>
        )}
      </GridList>
    ));
    user.hover(rows()[0] as HTMLElement);
    user.click(rows()[0] as HTMLElement);
    flush();
    expect(seen).toEqual(["hover", "press start", "own notes", "list notes", "press"]);
  });

  test("a row with an href is a link that the router follows", () => {
    const opened: string[] = [];
    const LINKS = [
      { id: "docs", name: "Docs", href: "/docs" },
      { id: "blog", name: "Blog", href: "/blog" },
    ];
    render(
      () =>
        provide(
          RouterContext,
          () => ({
            isNative: false,
            open: (_target: Element, _modifiers: object, href: string) => opened.push(href),
            href: (href: string) => href,
          }),
          () => (
            <GridList aria-label="Pages" items={LINKS}>
              {(page: { name: string }) => <GridListItem>{page.name}</GridListItem>}
            </GridList>
          ),
        ) as never,
    );

    expect(rows()[0]?.getAttribute("data-href")).toBe("/docs");
    user.click(rows()[0] as HTMLElement);
    flush();
    expect(opened).toEqual(["/docs"]);

    user.keyDown("ArrowDown");
    user.key("Enter");
    flush();
    expect(opened).toEqual(["/docs", "/blog"]);
  });
});

describe("a selection checkbox", () => {
  function Checked(props: {
    selectionBehavior?: "toggle" | "replace";
    onSelectionChange?: (keys: "all" | Set<Key>) => void;
  }) {
    return (
      <GridList
        aria-label="Files"
        items={FILES}
        selectionMode="multiple"
        selectionBehavior={props.selectionBehavior}
        onSelectionChange={props.onSelectionChange}
      >
        {(file: File) => (
          <GridListItem>
            <GridListSelectionCheckbox />
            {file.name}
          </GridListItem>
        )}
      </GridList>
    );
  }

  test("is named after its row and follows the row's selection", () => {
    render(() => <Checked />);
    const box = screen.getByRole<HTMLInputElement>("checkbox", { name: "Select Budget" });
    expect(box.checked).toBe(false);
    user.click(rows()[1] as HTMLElement);
    flush();
    expect(box.checked).toBe(true);
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Select Archive" }).disabled,
    ).toBe(true);
  });

  test("adds to the selection even under replace selection", () => {
    const selections: string[][] = [];
    render(() => (
      <Checked
        selectionBehavior="replace"
        onSelectionChange={(keys) =>
          selections.push(keys === "all" ? ["all"] : [...keys].map(String).toSorted())
        }
      />
    ));
    user.click(screen.getByRole("checkbox", { name: "Select Notes" }));
    user.click(screen.getByRole("checkbox", { name: "Select Budget" }));
    flush();
    expect(selections.at(-1)).toEqual(["budget", "notes"]);
  });
});

describe("sections", () => {
  type Entry = { id: string; name: string; files?: Entry[] };
  const GROUPS: Entry[] = [
    {
      id: "documents",
      name: "Documents",
      files: [
        { id: "notes", name: "Notes" },
        { id: "budget", name: "Budget" },
      ],
    },
    { id: "media", name: "Media", files: [{ id: "photos", name: "Photos" }] },
  ];

  function Grouped() {
    return (
      <GridList aria-label="Files" items={GROUPS} getChildren={(entry: Entry) => entry.files}>
        {(entry: Entry) =>
          entry.files === undefined ? (
            <GridListItem>{entry.name}</GridListItem>
          ) : (
            <GridListSection>
              <GridListHeader>{entry.name}</GridListHeader>
            </GridListSection>
          )
        }
      </GridList>
    );
  }

  test("each section is a row group named by its header", () => {
    render(() => <Grouped />);
    const groups = screen.getAllByRole("rowgroup");
    expect(groups.map((group) => accessibleName(group))).toEqual(["Documents", "Media"]);
    expect(
      within(groups[0] as HTMLElement)
        .getAllByRole("row")
        .map((row) => row.textContent),
    ).toEqual(["Documents", "Notes", "Budget"]);
    expect(screen.getByRole("rowheader", { name: "Media" })).not.toBeNull();
  });

  test("the keyboard walks the rows across sections and never stops on a header", () => {
    render(() => <Grouped />);
    user.focus(screen.getByRole("grid"));
    expect(document.activeElement?.textContent).toBe("Notes");
    user.keyDown("ArrowDown");
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement?.textContent).toBe("Photos");
    user.keyDown("Home");
    flush();
    expect(document.activeElement?.textContent).toBe("Notes");
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Grouped />);
    expectNoAriaViolations(container);
  });
});

describe("a selection indicator", () => {
  test("is shown in the selected row only", () => {
    render(() => (
      <GridList
        aria-label="Files"
        items={FILES}
        selectionMode="single"
        defaultSelectedKeys={["budget"]}
      >
        {(file: File) => (
          <GridListItem>
            {file.name}
            <SelectionIndicator class="indicator" />
          </GridListItem>
        )}
      </GridList>
    ));
    const shown = [...document.querySelectorAll(".indicator")];
    expect(shown.map((each) => each.closest('[role="row"]')?.textContent)).toEqual(["Budget"]);
  });
});

describe("selection announcements", () => {
  const PLAIN: File[] = [
    { id: "notes", name: "Notes" },
    { id: "budget", name: "Budget" },
    { id: "photos", name: "Photos" },
  ];

  beforeEach(() => destroyAnnouncer());
  afterEach(() => {
    destroyAnnouncer();
    Reflect.deleteProperty(window, "ontouchstart");
  });

  function Plain(props: {
    selectionMode?: "single" | "multiple";
    selectionBehavior?: "toggle" | "replace";
    selectedKeys?: Iterable<Key>;
    onAction?: (key: Key) => void;
    withCheckboxes?: boolean;
  }) {
    return (
      <GridList
        aria-label="Files"
        items={PLAIN}
        selectionMode={props.selectionMode ?? "multiple"}
        selectionBehavior={props.selectionBehavior}
        selectedKeys={props.selectedKeys}
        onAction={props.onAction}
      >
        {(file: File) => (
          <GridListItem>
            {() => (props.withCheckboxes === true ? <GridListSelectionCheckbox /> : null)}
            {file.name}
          </GridListItem>
        )}
      </GridList>
    );
  }

  /** The last thing said, after the frame a change made without focus waits for. */
  async function said(): Promise<string | undefined> {
    await nextFrame();
    return announcements().at(-1);
  }

  test("a row selected and deselected is named", async () => {
    render(() => <Plain selectionMode="single" />);
    user.click(rows()[1] as HTMLElement);
    flush();
    expect(await said()).toBe("Budget selected.");
    user.click(rows()[1] as HTMLElement);
    flush();
    expect(await said()).toBe("Budget not selected.");
    expect(announcements()).toHaveLength(2);
  });

  test("the count follows once more than one row is selected", async () => {
    render(() => <Plain withCheckboxes />);
    const boxes = (): HTMLElement[] => screen.getAllByRole("checkbox");
    user.click(boxes()[1] as HTMLElement);
    flush();
    expect(await said()).toBe("Budget selected.");
    user.click(boxes()[2] as HTMLElement);
    flush();
    expect(await said()).toBe("Photos selected. 2 items selected.");
    user.click(boxes()[2] as HTMLElement);
    flush();
    expect(await said()).toBe("Photos not selected. 1 item selected.");
    expect(announcements()).toHaveLength(3);
  });

  test("Space and Enter on a row announce it", async () => {
    render(() => <Plain />);
    user.tab();
    user.keyboard(" ");
    flush();
    expect(await said()).toBe("Notes selected.");
    user.keyboard("{ArrowDown}");
    user.keyboard("{Enter}");
    flush();
    expect(await said()).toBe("Budget selected. 2 items selected.");
  });

  test("a range is announced as its count alone", async () => {
    render(() => <Plain />);
    user.click(rows()[0] as HTMLElement);
    flush();
    user.click(rows()[2] as HTMLElement, { shiftKey: true });
    flush();
    expect(await said()).toBe("3 items selected.");
    user.click(rows()[0] as HTMLElement, { shiftKey: true });
    flush();
    expect(await said()).toBe("1 item selected.");
    expect(announcements()).toHaveLength(3);
  });

  test("select all and clearing it are announced", async () => {
    render(() => <Plain />);
    user.click(rows()[0] as HTMLElement);
    flush();
    expect(await said()).toBe("Notes selected.");
    user.key("a", { ctrlKey: true, metaKey: true });
    flush();
    expect(await said()).toBe("All items selected.");
    user.keyboard("{Escape}");
    flush();
    expect(await said()).toBe("No items selected.");
    expect(announcements()).toHaveLength(3);
  });

  test("under replace selection the arrows name the row they select, and no count", async () => {
    render(() => <Plain selectionBehavior="replace" />);
    user.click(rows()[0] as HTMLElement);
    flush();
    expect(await said()).toBe("Notes selected.");
    user.keyboard("{ArrowDown}");
    flush();
    expect(await said()).toBe("Budget selected.");
    user.keyboard("{ArrowUp}");
    flush();
    expect(await said()).toBe("Notes selected.");
    user.key("ArrowDown", { shiftKey: true });
    flush();
    expect(await said()).toBe("Budget selected. 2 items selected.");
    user.keyboard("{ArrowDown}");
    flush();
    expect(await said()).toBe("Photos selected. 1 item selected.");
    expect(announcements()).toHaveLength(5);
  });

  test("moving focus without selecting says nothing", async () => {
    render(() => <Plain selectionBehavior="replace" />);
    user.click(rows()[0] as HTMLElement);
    flush();
    user.key("ArrowDown", { ctrlKey: true, metaKey: true });
    flush();
    await nextFrame();
    expect(announcements()).toEqual(["Notes selected."]);
    expect(document.activeElement).toBe(rows()[1] as HTMLElement);
  });

  test("from all to one row names the row and the count", async () => {
    render(() => <Plain selectionBehavior="replace" />);
    user.click(rows()[0] as HTMLElement);
    flush();
    user.key("a", { ctrlKey: true, metaKey: true });
    flush();
    expect(await said()).toBe("All items selected.");
    user.keyboard("{ArrowDown}");
    flush();
    expect(await said()).toBe("Budget selected. 1 item selected.");
  });

  test("a selection the page changes while the grid is not focused is not announced", async () => {
    const [selected, setSelected] = createSignal<Key[]>([]);
    render(() => <Plain selectedKeys={selected()} />);
    setSelected(["budget"]);
    flush();
    await nextFrame();
    setSelected(["budget", "photos"]);
    flush();
    await nextFrame();
    expect(announcements()).toEqual([]);
  });

  test("a single selection never says a count", async () => {
    render(() => <Plain selectionMode="single" />);
    user.click(rows()[0] as HTMLElement);
    flush();
    await nextFrame();
    // One row in and one out is neither a row added nor a row removed, and a
    // single selection has no count to fall back on.
    user.click(rows()[1] as HTMLElement);
    flush();
    await nextFrame();
    expect(announcements()).toEqual(["Notes selected."]);
  });

  test("is said in the reader's language", async () => {
    render(() => {
      const localeProps = provideLocale(() => "de-DE");
      return (
        <div {...localeProps}>
          <Plain withCheckboxes />
        </div>
      );
    });
    const boxes = (): HTMLElement[] => screen.getAllByRole("checkbox");
    user.click(boxes()[0] as HTMLElement);
    flush();
    user.click(boxes()[1] as HTMLElement);
    flush();
    expect(await said()).toBe("Budget ausgewählt. 2 Elemente ausgewählt.");
  });

  test("on a touch device a grid whose tap is an action describes the long press", () => {
    Object.defineProperty(window, "ontouchstart", { value: null, configurable: true });
    render(() => <Plain selectionBehavior="replace" onAction={() => {}} />);
    const grid = screen.getByRole("grid");
    const ids = grid.getAttribute("aria-describedby")?.split(" ") ?? [];
    const described = ids.map((id) => document.getElementById(id)?.textContent);
    expect(described).toContain("Long press to enter selection mode.");
  });

  test("the long press is not described without an action, a touch screen or replace", () => {
    Object.defineProperty(window, "ontouchstart", { value: null, configurable: true });
    const { unmount } = render(() => <Plain selectionBehavior="replace" />);
    expect(screen.getByRole("grid").hasAttribute("aria-describedby")).toBe(false);
    unmount();

    render(() => <Plain onAction={() => {}} />);
    expect(screen.getByRole("grid").hasAttribute("aria-describedby")).toBe(false);
  });

  test("without a touch screen there is no long press to describe", () => {
    render(() => <Plain selectionBehavior="replace" onAction={() => {}} />);
    expect(screen.getByRole("grid").hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("loading more", () => {
  interface Entry {
    id: string;
    name: string;
    kind?: "loader";
  }

  const PAGE: Entry[] = [
    { id: "notes", name: "Notes" },
    { id: "budget", name: "Budget" },
    { id: "loader", name: "Loading", kind: "loader" },
  ];

  function Loading(props: {
    items?: Entry[];
    isLoading?: boolean;
    onLoadMore?: () => void;
    renderEmptyState?: (grid: GridListRenderState) => Child;
  }) {
    return (
      <GridList
        aria-label="Files"
        items={props.items ?? PAGE}
        selectionMode="multiple"
        getType={(entry: Entry) => (entry.kind === "loader" ? "loader" : "item")}
        renderEmptyState={props.renderEmptyState}
      >
        {(entry: Entry) =>
          entry.kind === "loader" ? (
            <GridListLoadMoreItem isLoading={props.isLoading} onLoadMore={props.onLoadMore}>
              {entry.name}
            </GridListLoadMoreItem>
          ) : (
            <GridListItem>{entry.name}</GridListItem>
          )
        }
      </GridList>
    );
  }

  test("the loading row is a row holding a cell, and the keyboard skips it", () => {
    render(() => <Loading isLoading />);
    const all = rows();
    expect(all.map((row) => row.textContent)).toEqual(["Notes", "Budget", "Loading"]);
    const loader = all[2] as HTMLElement;
    expect(within(loader).getByRole("gridcell").hasAttribute("aria-colindex")).toBe(false);
    expect(loader.hasAttribute("aria-selected")).toBe(false);
    expect(loader.hasAttribute("tabindex")).toBe(false);

    user.tab();
    user.keyboard("{End}");
    flush();
    expect(document.activeElement?.textContent).toBe("Budget");
    user.keyboard("{ArrowDown}");
    flush();
    expect(document.activeElement?.textContent).toBe("Budget");
    // Select all is every item, and the loader is not one.
    user.key("a", { ctrlKey: true, metaKey: true });
    flush();
    expect(rows().filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(2);
  });

  test("not loading, the sentinel is there and the row is not", () => {
    const { container } = render(() => <Loading />);
    expect(rows()).toHaveLength(2);
    const sentinels = container.querySelectorAll("[data-load-more-sentinel]");
    expect(sentinels).toHaveLength(1);
    expect(sentinels[0]?.closest("[inert]")).not.toBeNull();
    expectNoAriaViolations(container);
  });

  test("the sentinel asks for more when it comes into reach, loading or not", () => {
    const intersections = stubIntersections();
    try {
      let loads = 0;
      const [loading, setLoading] = createSignal(true);
      render(() => <Loading isLoading={loading()} onLoadMore={() => loads++} />);
      flush();
      expect(intersections.live()).toHaveLength(1);
      intersections.fire();
      expect(loads).toBe(1);
      setLoading(false);
      flush();
      intersections.fire();
      expect(loads).toBe(2);
    } finally {
      intersections.restore();
    }
  });

  test("a grid holding only a loader is empty, and shows both", () => {
    const [loading, setLoading] = createSignal(true);
    render(() => (
      <Loading
        items={[{ id: "loader", name: "Loading", kind: "loader" }]}
        isLoading={loading()}
        renderEmptyState={(_grid: GridListRenderState) => (loading() ? null : "No files")}
      />
    ));
    expect(screen.getByRole("grid").hasAttribute("data-empty")).toBe(true);
    expect(rows().map((row) => row.textContent)).toEqual(["Loading", ""]);
    setLoading(false);
    flush();
    expect(rows().map((row) => row.textContent)).toEqual(["No files"]);
  });

  test("virtualised, the loader follows the last row and is counted nowhere", () => {
    const many: Entry[] = [
      ...Array.from({ length: 50 }, (_, at) => ({ id: `f${at}`, name: `File ${at}` })),
      { id: "loader", name: "Loading", kind: "loader" as const },
    ];
    const { container } = render(() => (
      <Virtualizer layout={listLayout({ rowHeight: 20 })} overscan={0}>
        <Loading items={many} isLoading />
      </Virtualizer>
    ));
    const grid = screen.getByRole("grid");
    grid.style.overflow = "auto";
    Object.defineProperty(grid, "clientHeight", { value: 100, configurable: true });
    Object.defineProperty(grid, "clientWidth", { value: 200, configurable: true });
    grid.dispatchEvent(new Event("scroll"));
    flush();

    expect(grid.getAttribute("aria-rowcount")).toBe("50");
    const loader = rows().at(-1) as HTMLElement;
    expect(loader.textContent).toBe("Loading");
    expect(loader.style.top).toBe("1000px");
    expect(loader.style.height).toBe("20px");
    expect(within(loader).getByRole("gridcell").getAttribute("aria-colindex")).toBe("1");
    expect(grid.style.height).toBe("1020px");
    const box = container.querySelector("[data-load-more-sentinel]")?.parentElement;
    expect(box?.style.top).toBe("1000px");
  });
});
