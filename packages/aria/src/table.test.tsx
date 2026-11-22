import { afterEach, describe, expect, mock, test } from "bun:test";
import { flush, createSignal } from "@barqjs/core";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  tabbableElements,
  user,
  within,
} from "@barqjs/testing";
import { Button } from "./button.tsx";
import type { Key } from "./collections.ts";
import { dragSession, type DroppableCollectionReorderEvent, type DropTarget } from "./dnd/index.ts";
import {
  DragButton,
  dragAndDrop,
  type DragAndDropOptions,
  DropIndicator,
} from "./drag-and-drop.tsx";
import { clearAnnouncer } from "./live.ts";
import { fireDrag, MockDataTransfer, nextFrame, restoreRects, stubRects } from "./test-dnd.ts";
import {
  Cell,
  Column,
  Row,
  Table,
  TableBody,
  TableExpandButton,
  TableFooter,
  TableHeader,
  type SortDescriptor,
  useTable,
} from "./table.tsx";
import { SelectionIndicator } from "./selection-indicator.tsx";

interface Column_ {
  id: string;
  name: string;
  allowsSorting?: boolean;
  isRowHeader?: boolean;
}

interface File_ {
  id: string;
  name: string;
  size: string;
  modified: string;
  isDisabled?: boolean;
  [key: string]: unknown;
}

const COLUMNS: Column_[] = [
  { id: "name", name: "Name", isRowHeader: true, allowsSorting: true },
  { id: "size", name: "Size", allowsSorting: true },
  { id: "modified", name: "Modified" },
];

const FILES: File_[] = [
  { id: "notes", name: "Notes", size: "2 KB", modified: "Today" },
  { id: "budget", name: "Budget", size: "40 KB", modified: "Yesterday" },
  { id: "archive", name: "Archive", size: "1 MB", modified: "Last week", isDisabled: true },
  { id: "photos", name: "Photos", size: "9 MB", modified: "March" },
];

function Files(props: {
  selectionMode?: "none" | "single" | "multiple";
  sortDescriptor?: SortDescriptor;
  onSortChange?: (descriptor: SortDescriptor) => void;
  onSelectionChange?: (keys: "all" | Set<Key>) => void;
  onAction?: (key: Key) => void;
}) {
  return (
    <Table
      aria-label="Files"
      columns={COLUMNS}
      items={FILES}
      selectionMode={props.selectionMode ?? "none"}
      sortDescriptor={props.sortDescriptor}
      onSortChange={props.onSortChange}
      onSelectionChange={props.onSelectionChange}
      onAction={props.onAction}
    >
      <TableHeader>{(column: Column_) => <Column>{column.name}</Column>}</TableHeader>
      <TableBody>
        {(file: File_) => <Row>{(column: Column_) => <Cell>{String(file[column.id])}</Cell>}</Row>}
      </TableBody>
    </Table>
  );
}

function headers(): HTMLElement[] {
  return screen.getAllByRole("columnheader");
}

/** A cell, by the row it is in and the column header above it. */
function cell(rowName: string, columnName: string): HTMLElement {
  const row = screen.getByRole("row", { name: rowName });
  const at = COLUMNS.findIndex((column) => column.name === columnName);
  // The row header is one of the cells, and it is not a `gridcell`, so the
  // row's cells are gathered in document order rather than by role.
  const cells = [
    ...within(row).getAllByRole("rowheader"),
    ...within(row).getAllByRole("gridcell"),
  ].toSorted(
    (a: Element, b: Element) =>
      Number(a.getAttribute("aria-colindex")) - Number(b.getAttribute("aria-colindex")),
  );
  return cells[at] as HTMLElement;
}

describe("Table", () => {
  test("is a named grid of rows, headers and cells", () => {
    render(() => <Files />);

    const grid = screen.getByRole("grid");
    expect(accessibleName(grid)).toBe("Files");
    expect(headers()).toHaveLength(3);
    // One header row and four body rows.
    expect(screen.getAllByRole("row")).toHaveLength(5);
    expect(screen.getAllByRole("rowgroup")).toHaveLength(2);
  });

  test("the row header column identifies its row", () => {
    render(() => <Files />);

    // Three columns, one of which is the row header, so two plain cells a row.
    expect(screen.getAllByRole("rowheader")).toHaveLength(4);
    expect(screen.getAllByRole("gridcell")).toHaveLength(8);
  });

  test("a row is named by its row header cells", () => {
    render(() => <Files />);

    const row = screen
      .getAllByRole("row")
      .find((element: Element) => element.textContent?.startsWith("Budget")) as HTMLElement;
    expect(accessibleName(row)).toBe("Budget");
  });

  test("every cell says which column it is in", () => {
    render(() => <Files />);

    expect(cell("Notes", "Name").getAttribute("aria-colindex")).toBe("1");
    expect(cell("Notes", "Size").getAttribute("aria-colindex")).toBe("2");
    expect(cell("Notes", "Modified").getAttribute("aria-colindex")).toBe("3");
  });

  test("the arrows move a cell at a time, in both directions", () => {
    render(() => <Files />);

    user.focus(screen.getByRole("grid"));
    flush();
    expect(document.activeElement).toBe(cell("Notes", "Name"));

    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(cell("Notes", "Size"));

    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(cell("Budget", "Size"));

    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement).toBe(cell("Budget", "Name"));
  });

  test("the arrows stop at the ends of a row rather than wrapping", () => {
    render(() => <Files />);

    user.focus(screen.getByRole("grid"));
    flush();
    user.keyDown("ArrowLeft");
    flush();

    expect(document.activeElement).toBe(cell("Notes", "Name"));
  });

  test("up from the first row reaches the column header", () => {
    render(() => <Files />);

    user.focus(screen.getByRole("grid"));
    flush();
    user.keyDown("ArrowUp");
    flush();

    expect(document.activeElement).toBe(headers()[0] as HTMLElement);
  });

  test("down from a column header enters its column", () => {
    render(() => <Files />);

    user.focus(headers()[1] as HTMLElement);
    user.keyDown("ArrowDown");
    flush();

    expect(document.activeElement).toBe(cell("Notes", "Size"));
  });

  test("the arrows skip a disabled row", () => {
    render(() => <Files />);

    user.focus(cell("Budget", "Name"));
    user.keyDown("ArrowDown");
    flush();

    // Archive is disabled, so Down lands on Photos.
    expect(document.activeElement).toBe(cell("Photos", "Name"));
  });

  test("only a sortable column header offers to sort", () => {
    render(() => <Files />);

    expect(headers()[0]?.getAttribute("data-sortable")).toBe("");
    expect(headers()[2]?.hasAttribute("data-sortable")).toBe(false);
  });

  test("pressing a sortable header sorts ascending, then descending", () => {
    const [sort, setSort] = createSignal<SortDescriptor | undefined>(undefined);
    const changes: SortDescriptor[] = [];
    render(() => (
      <Files
        sortDescriptor={sort()}
        onSortChange={(descriptor) => {
          changes.push(descriptor);
          setSort(descriptor);
        }}
      />
    ));

    user.click(headers()[0] as HTMLElement);
    flush();
    expect(changes).toEqual([{ column: "name", direction: "ascending" }]);

    user.click(headers()[0] as HTMLElement);
    flush();
    expect(changes.at(-1)).toEqual({ column: "name", direction: "descending" });
  });

  test("only the sorted column says it is sorted", () => {
    render(() => <Files sortDescriptor={{ column: "size", direction: "descending" }} />);

    expect(headers()[0]?.hasAttribute("aria-sort")).toBe(false);
    expect(headers()[1]?.getAttribute("aria-sort")).toBe("descending");
    expect(headers()[2]?.hasAttribute("aria-sort")).toBe(false);
  });

  test("a keyboard user can sort", () => {
    const changes: SortDescriptor[] = [];
    render(() => <Files onSortChange={(descriptor) => changes.push(descriptor)} />);

    user.focus(headers()[1] as HTMLElement);
    user.keyDown("Enter");
    flush();

    expect(changes).toEqual([{ column: "size", direction: "ascending" }]);
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

    user.click(cell("Budget", "Name"));
    flush();

    expect(selections).toEqual([["budget"]]);
  });

  test("the table says it takes more than one selection", () => {
    render(() => <Files selectionMode="multiple" />);
    expect(screen.getByRole("grid").getAttribute("aria-multiselectable")).toBe("true");
  });

  test("a row that cannot be selected does not claim to be unselected", () => {
    render(() => <Files />);

    const row = screen
      .getAllByRole("row")
      .find((element: Element) => element.textContent?.startsWith("Budget")) as HTMLElement;
    expect(row.hasAttribute("aria-selected")).toBe(false);
  });

  test("typing jumps to a matching row", () => {
    render(() => <Files />);

    user.focus(screen.getByRole("grid"));
    flush();
    user.keyDown("p");
    flush();

    expect(document.activeElement).toBe(cell("Photos", "Name"));
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => (
      <Files selectionMode="multiple" sortDescriptor={{ column: "name", direction: "ascending" }} />
    ));
    expectNoAriaViolations(container);
  });
});

describe("an action that arrives after the rows were built", () => {
  test("a row picks up an onAction the table did not have at construction", () => {
    const acted: Key[] = [];
    const [enabled, setEnabled] = createSignal(false);

    render(() => <Files onAction={enabled() ? (key: Key) => acted.push(key) : undefined} />);

    user.click(cell("Budget", "Name"));
    expect(acted, "an action ran before one was declared").toEqual([]);

    setEnabled(true);
    flush();

    user.click(cell("Budget", "Name"));
    flush();
    expect(acted, "the row is still reading the action it saw at construction").toEqual(["budget"]);
  });
});

describe("pressing the same cell twice", () => {
  test("the second press reaches the row, not the cell that took focus", () => {
    const acted: Key[] = [];
    render(() => <Files onAction={(key: Key) => acted.push(key)} />);

    user.click(cell("Budget", "Name"));
    flush();
    user.click(cell("Budget", "Name"));
    flush();

    expect(acted, "the cell's roving tabindex swallowed the second press").toEqual([
      "budget",
      "budget",
    ]);
  });

  test("a button inside a row still keeps its own press", () => {
    const acted: Key[] = [];
    const pushed: string[] = [];

    render(() => (
      <Table
        aria-label="Files"
        columns={COLUMNS}
        items={FILES}
        onAction={(key: Key) => acted.push(key)}
      >
        <TableHeader>{(column: Column_) => <Column>{column.name}</Column>}</TableHeader>
        <TableBody>
          {(file: File_) => (
            <Row>
              {(column: Column_) => (
                <Cell>
                  {column.id === "name" ? (
                    <Button onPress={() => pushed.push(file.id)}>Open {file.name}</Button>
                  ) : (
                    String(file[column.id])
                  )}
                </Cell>
              )}
            </Row>
          )}
        </TableBody>
      </Table>
    ));

    user.click(screen.getByRole("button", { name: "Open Budget" }));
    flush();

    expect(pushed).toEqual(["budget"]);
    expect(acted, "the row acted on a press that belonged to the button").toEqual([]);
  });
});

describe("paging through a table", () => {
  test("Page Down moves by a viewport and keeps the column", () => {
    render(() => <Files />);

    const start = cell("Notes", "Size");
    user.focus(start);
    flush();

    user.keyDown("PageDown");
    flush();

    // Nothing scrolls in this fixture, so a page is the whole table: the last
    // row, in the SAME column. Landing back in the first column would lose a
    // keyboard user's place across a wide table.
    const active = document.activeElement as HTMLElement | null;
    expect(active?.getAttribute("aria-colindex")).toBe(start.getAttribute("aria-colindex"));
    expect(active?.textContent).toBe("9 MB");
  });

  test("Page Up goes as far up as the arrows do, which is the column header", () => {
    render(() => <Files />);

    user.focus(cell("Photos", "Name"));
    flush();
    user.keyDown("PageUp");
    flush();

    // Up from the first row reaches the COLUMN HEADER — that is what ArrowUp
    // does here, and a page key that stopped one row short of where the arrows
    // go would be a second, quieter rule to learn.
    expect(document.activeElement?.getAttribute("role")).toBe("columnheader");
    expect(document.activeElement?.textContent).toBe("Name");
  });
});

describe("deleting the row that holds focus", () => {
  test("the cell in the same column of the next row takes the Tab stop", async () => {
    const [files, setFiles] = createSignal(FILES);
    render(() => (
      <Table aria-label="Files" columns={COLUMNS} items={files()}>
        <TableHeader>{(column: Column_) => <Column>{column.name}</Column>}</TableHeader>
        <TableBody>
          {(file: File_) => (
            <Row>{(column: Column_) => <Cell>{String(file[column.id])}</Cell>}</Row>
          )}
        </TableBody>
      </Table>
    ));

    user.focus(cell("Budget", "Size"));
    flush();
    setFiles(FILES.filter((file) => file.id !== "budget"));
    flush();

    // Archive is disabled, so Photos is the row that takes the place.
    const stops = tabbableElements(screen.getByRole("grid"));
    expect(
      stops.map((stop: HTMLElement) => stop.textContent),
      "nothing in the table can be reached by Tab",
    ).toEqual(["9 MB"]);
    expect(stops[0] === cell("Photos", "Size")).toBe(true);
  });

  test("with no rows left the grid itself is the Tab stop again", () => {
    const [files, setFiles] = createSignal(FILES.slice(0, 1));
    render(() => (
      <Table aria-label="Files" columns={COLUMNS} items={files()}>
        <TableHeader>{(column: Column_) => <Column>{column.name}</Column>}</TableHeader>
        <TableBody>
          {(file: File_) => (
            <Row>{(column: Column_) => <Cell>{String(file[column.id])}</Cell>}</Row>
          )}
        </TableBody>
      </Table>
    ));

    user.focus(cell("Notes", "Name"));
    flush();
    setFiles([]);
    flush();

    expect(screen.getByRole("grid").getAttribute("tabindex")).toBe("0");
  });
});

/** The files, with a control or two in the "modified" column. */
function WithControls(props: {
  keyboardNavigationBehavior?: "arrow" | "tab";
  twoButtons?: boolean;
}) {
  return (
    <Table
      aria-label="Files"
      columns={COLUMNS}
      items={FILES}
      keyboardNavigationBehavior={props.keyboardNavigationBehavior}
    >
      <TableHeader>{(column: Column_) => <Column>{column.name}</Column>}</TableHeader>
      <TableBody>
        {(file: File_) => (
          <Row>
            {(column: Column_) => (
              <Cell>
                {column.id === "modified" ? (
                  <>
                    <Button>Open {file.name}</Button>
                    {props.twoButtons === true ? <Button>Share {file.name}</Button> : null}
                    <input aria-label={`Rename ${file.name}`} />
                  </>
                ) : (
                  String(file[column.id])
                )}
              </Cell>
            )}
          </Row>
        )}
      </TableBody>
    </Table>
  );
}

describe("controls inside a cell", () => {
  test("the arrows reach a button in a cell", () => {
    render(() => <WithControls />);

    user.focus(cell("Notes", "Size"));
    flush();
    user.keyDown("ArrowRight");
    flush();

    expect(document.activeElement, "the cell took focus and its button never can").toBe(
      screen.getByRole("button", { name: "Open Notes" }),
    );
  });

  test("the arrows walk the controls of a cell before leaving it", () => {
    render(() => <WithControls twoButtons />);

    user.focus(cell("Notes", "Size"));
    flush();
    user.keyDown("ArrowRight");
    flush();
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Share Notes" }));

    user.keyDown("ArrowLeft");
    flush();
    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement).toBe(cell("Notes", "Size"));
  });

  test("down from a control moves to the same column of the next row", () => {
    render(() => <WithControls />);

    user.focus(cell("Notes", "Size"));
    flush();
    user.keyDown("ArrowRight");
    flush();
    user.keyDown("ArrowDown");
    flush();

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open Budget" }));
  });

  test("with Tab navigation, keys typed into a field in a cell stay in the field", () => {
    render(() => <WithControls keyboardNavigationBehavior="tab" />);

    const field = screen.getByRole("textbox", { name: "Rename Budget" });
    user.focus(field);
    flush();

    user.keyDown("p");
    flush();
    expect(document.activeElement, "the letter was taken as a typeahead").toBe(field);

    expect(user.keyDown("ArrowDown"), "the grid took the arrow from the field").toBe(true);
    flush();
    expect(document.activeElement).toBe(field);
  });

  test("with Tab navigation, the cell is focused and Tab moves into it", () => {
    render(() => <WithControls keyboardNavigationBehavior="tab" />);

    user.focus(cell("Notes", "Size"));
    flush();
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(cell("Notes", "Modified"));

    user.tab();
    flush();
    expect(document.activeElement, "Tab left the grid from a cell with controls").toBe(
      screen.getByRole("button", { name: "Open Notes" }),
    );
  });
});

describe("Home and End", () => {
  test("go to the start and the end of the row", () => {
    render(() => <Files />);

    user.focus(cell("Budget", "Size"));
    flush();
    user.keyDown("Home");
    flush();
    expect(document.activeElement, "Home stayed in the column").toBe(cell("Budget", "Name"));

    user.keyDown("End");
    flush();
    expect(document.activeElement).toBe(cell("Budget", "Modified"));
  });

  test("with Control, go to the first and the last cell of the table", () => {
    render(() => <Files />);

    user.focus(cell("Budget", "Size"));
    flush();
    user.keyDown("End", { ctrlKey: true, metaKey: true });
    flush();
    expect(document.activeElement).toBe(cell("Photos", "Modified"));

    user.keyDown("Home", { ctrlKey: true, metaKey: true });
    flush();
    expect(document.activeElement).toBe(cell("Notes", "Name"));
  });
});

describe("typeahead over rows with no name of their own", () => {
  interface Entry {
    id: string;
    file: string;
    size: string;
    [key: string]: unknown;
  }
  const ENTRY_COLUMNS = [
    { id: "file", name: "File", isRowHeader: true },
    { id: "size", name: "Size" },
  ];
  const ENTRIES: Entry[] = [
    { id: "a", file: "Alpha", size: "1" },
    { id: "b", file: "Beta", size: "2" },
    { id: "g", file: "Gamma", size: "3" },
  ];

  function Entries() {
    return (
      <Table aria-label="Entries" columns={ENTRY_COLUMNS} items={ENTRIES}>
        <TableHeader>{(column: { name: string }) => <Column>{column.name}</Column>}</TableHeader>
        <TableBody>
          {(entry: Entry) => (
            <Row>{(column: { id: string }) => <Cell>{String(entry[column.id])}</Cell>}</Row>
          )}
        </TableBody>
      </Table>
    );
  }

  test("matches what the row header cells show", () => {
    render(() => <Entries />);
    user.focus(screen.getByRole("grid"));
    flush();

    user.keyDown("g");
    flush();
    expect(document.activeElement?.textContent).toBe("Gamma");
  });

  test("never matches the text of an object", () => {
    render(() => <Entries />);
    user.focus(screen.getByRole("grid"));
    flush();

    user.keyDown("[");
    flush();
    expect(document.activeElement?.textContent, "a row was typed to as [object Object]").toBe(
      "Alpha",
    );
  });
});

describe("rows with no key of their own", () => {
  test("are keyed by position and still navigable", () => {
    const rows = FILES.map(({ id: _id, ...rest }) => rest);
    render(() => (
      <Table aria-label="Files" columns={COLUMNS} items={rows}>
        <TableHeader>{(column: Column_) => <Column>{column.name}</Column>}</TableHeader>
        <TableBody>
          {(file: Record<string, unknown>) => (
            <Row>{(column: Column_) => <Cell>{String(file[column.id])}</Cell>}</Row>
          )}
        </TableBody>
      </Table>
    ));

    user.focus(screen.getByRole("grid"));
    flush();
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement?.textContent, "a numeric row key named no cell").toBe("Budget");
  });

  test("a key accessor given to the table is used", () => {
    const selections: string[][] = [];
    render(() => (
      <Table
        aria-label="Files"
        columns={COLUMNS}
        items={FILES}
        selectionMode="multiple"
        rowAccessors={{ getKey: (file: File_) => `file-${file.id}` }}
        onSelectionChange={(keys) =>
          selections.push(keys === "all" ? ["all"] : [...keys].map(String))
        }
      >
        <TableHeader>{(column: Column_) => <Column>{column.name}</Column>}</TableHeader>
        <TableBody>
          {(file: File_) => (
            <Row>{(column: Column_) => <Cell>{String(file[column.id])}</Cell>}</Row>
          )}
        </TableBody>
      </Table>
    ));

    user.click(cell("Budget", "Name"));
    flush();
    expect(selections).toEqual([["file-budget"]]);
  });
});

describe("an empty table", () => {
  test("shows renderEmpty in a cell spanning the columns", () => {
    render(() => (
      <Table aria-label="Files" columns={COLUMNS} items={[]}>
        <TableHeader>{(column: Column_) => <Column>{column.name}</Column>}</TableHeader>
        <TableBody renderEmpty={<span>No files</span>}>
          {(file: File_) => (
            <Row>{(column: Column_) => <Cell>{String(file[column.id])}</Cell>}</Row>
          )}
        </TableBody>
      </Table>
    ));

    const empty = screen.getByText("No files");
    const gridcell = empty.closest('[role="gridcell"]');
    expect(gridcell, "renderEmpty was never rendered").not.toBeNull();
    expect(gridcell?.getAttribute("aria-colspan")).toBe("3");
    expect(gridcell?.parentElement?.getAttribute("role")).toBe("row");
    expect(screen.getAllByRole("rowgroup")[1]?.hasAttribute("data-empty")).toBe(true);
  });
});

describe("a footer", () => {
  const TOTAL = [{ id: "total", name: "Total", size: "52 MB", modified: "" }];

  function WithFooter() {
    return (
      <Table aria-label="Files" columns={COLUMNS} items={FILES.slice(0, 2)}>
        <TableHeader>{(column: Column_) => <Column>{column.name}</Column>}</TableHeader>
        <TableBody>
          {(file: File_) => (
            <Row>{(column: Column_) => <Cell>{String(file[column.id])}</Cell>}</Row>
          )}
        </TableBody>
        <TableFooter items={TOTAL}>
          {(total: Record<string, string>) => (
            <Row>{(column: Column_) => <Cell>{total[column.id]}</Cell>}</Row>
          )}
        </TableFooter>
      </Table>
    );
  }

  test("is a third row group after the body", () => {
    render(() => <WithFooter />);

    const groups = screen.getAllByRole("rowgroup");
    expect(groups).toHaveLength(3);
    expect(within(groups[2] as HTMLElement).getByRole("row").textContent).toContain("Total");
  });

  test("its rows are reached with the arrows from the body", () => {
    render(() => <WithFooter />);

    user.focus(cell("Budget", "Size"));
    flush();
    user.keyDown("ArrowDown");
    flush();

    expect(document.activeElement?.textContent).toBe("52 MB");
  });
});

describe("rows that nest", () => {
  interface Folder {
    id: string;
    name: string;
    size: string;
    modified: string;
    children?: Folder[];
    [key: string]: unknown;
  }

  const TREE: Folder[] = [
    {
      id: "documents",
      name: "Documents",
      size: "",
      modified: "Today",
      children: [
        { id: "taxes", name: "Taxes", size: "1 MB", modified: "May" },
        { id: "letters", name: "Letters", size: "2 MB", modified: "June" },
      ],
    },
    { id: "music", name: "Music", size: "", modified: "Never" },
  ];

  function Folders(props: { onExpandedChange?: (keys: Set<Key>) => void }) {
    return (
      <Table
        aria-label="Folders"
        columns={COLUMNS}
        items={TREE}
        treeColumn="name"
        onExpandedChange={props.onExpandedChange}
      >
        <TableHeader>{(column: Column_) => <Column>{column.name}</Column>}</TableHeader>
        <TableBody>
          {(folder: Folder) => (
            <Row>
              {(column: Column_) => (
                <Cell>
                  {column.id === "name" && folder.children !== undefined ? (
                    <TableExpandButton>+</TableExpandButton>
                  ) : null}
                  {String(folder[column.id])}
                </Cell>
              )}
            </Row>
          )}
        </TableBody>
      </Table>
    );
  }

  // The expand button is in the row header, so it is part of the row's name.
  function row(name: string): HTMLElement {
    const found = screen
      .getAllByRole("row")
      .find((element: Element) =>
        element.querySelector('[role="rowheader"]')?.textContent?.endsWith(name),
      );
    if (found === undefined) throw new Error(`No row ${name}`);
    return found;
  }

  test("make the table a tree grid whose rows say where they sit", () => {
    render(() => <Folders />);

    expect(screen.getByRole("treegrid")).toBeTruthy();
    expect(row("Documents").getAttribute("aria-expanded")).toBe("false");
    expect(row("Documents").getAttribute("aria-level")).toBe("1");
    expect(row("Documents").getAttribute("aria-posinset")).toBe("1");
    expect(row("Documents").getAttribute("aria-setsize")).toBe("2");
    expect(row("Music").hasAttribute("aria-expanded")).toBe(false);
    expect(screen.queryByText("Taxes")).toBeNull();
  });

  test("the expand button shows the children, a level down", () => {
    const changes: string[][] = [];
    render(() => <Folders onExpandedChange={(keys) => changes.push([...keys].map(String))} />);

    const expand = screen.getByRole("button", { name: "Expand Documents" });
    user.click(expand);
    flush();

    expect(changes).toEqual([["documents"]]);
    expect(row("Documents").getAttribute("aria-expanded")).toBe("true");
    expect(row("Letters").getAttribute("aria-level")).toBe("2");
    expect(row("Letters").getAttribute("aria-posinset")).toBe("2");
    expect(screen.getByRole("button", { name: "Collapse Documents" })).toBe(expand);
  });

  test("the arrows expand and collapse from the tree column, and climb to the parent", () => {
    render(() => <Folders />);

    const documents = within(row("Documents")).getByRole("rowheader");
    user.focus(documents);
    flush();
    user.keyDown("ArrowRight");
    flush();
    expect(row("Documents").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(documents);

    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(within(row("Taxes")).getByRole("rowheader"));

    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement, "Left on a leaf goes to its parent").toBe(documents);

    user.keyDown("ArrowLeft");
    flush();
    expect(row("Documents").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Taxes")).toBeNull();
  });
});

describe("state as data attributes", () => {
  test("rows say how the table selects, and sortable headers say so", () => {
    render(() => <Files selectionMode="multiple" />);

    expect(screen.getByRole("row", { name: "Budget" }).getAttribute("data-selection-mode")).toBe(
      "multiple",
    );
    expect(headers()[0]?.hasAttribute("data-allows-sorting")).toBe(true);
    expect(cell("Budget", "Size").getAttribute("data-column-index")).toBe("1");
  });
});

describe("a selection indicator", () => {
  test("is shown in the selected row only", () => {
    render(() => (
      <Table
        aria-label="Files"
        columns={COLUMNS}
        items={FILES}
        selectionMode="single"
        defaultSelectedKeys={["budget"]}
      >
        <TableHeader>{(column: Column_) => <Column>{column.name}</Column>}</TableHeader>
        <TableBody>
          {(file: File_) => (
            <Row>
              {(column: Column_) => (
                <Cell>
                  {String(file[column.id])}
                  {column.id === "name" ? <SelectionIndicator data-testid="indicator" /> : null}
                </Cell>
              )}
            </Row>
          )}
        </TableBody>
      </Table>
    ));
    const shown = (role: string): (string | null)[] =>
      screen
        .queryAllByTestId("indicator")
        .map(
          (element: Element) =>
            element.closest(`[role="${role}"]`)?.getAttribute("data-key") ?? null,
        );
    expect(shown("row")).toEqual(["budget"]);
  });
});

describe("drag and drop", () => {
  interface Entry {
    id: string;
    name: string;
    type: string;
    modified: string;
    children?: Entry[];
    isDisabled?: boolean;
    [key: string]: unknown;
  }

  const DND_COLUMNS: Column_[] = [
    { id: "drag", name: "Drag" },
    { id: "name", name: "Name", isRowHeader: true },
    { id: "type", name: "Type" },
    { id: "modified", name: "Date Modified" },
  ];

  const ENTRIES: Entry[] = [
    { id: "1", name: "Games", type: "File folder", modified: "6/7/2020" },
    { id: "2", name: "Program Files", type: "File folder", modified: "4/7/2021" },
    { id: "3", name: "bootmgr", type: "System file", modified: "11/20/2010" },
  ];

  const NESTED: Entry[] = [
    {
      id: "documents",
      name: "Documents",
      type: "File folder",
      modified: "Today",
      children: [
        { id: "taxes", name: "Taxes", type: "File", modified: "May" },
        { id: "letters", name: "Letters", type: "File", modified: "June" },
      ],
    },
    { id: "music", name: "Music", type: "File folder", modified: "Never" },
  ];

  interface DnDProps {
    label?: string;
    items?: Entry[];
    options?: Partial<DragAndDropOptions<Entry>>;
    selectionMode?: "none" | "single" | "multiple";
    disabledKeys?: Iterable<Key>;
    treeColumn?: Key;
    defaultExpandedKeys?: Iterable<Key>;
    onSelectionChange?: (keys: "all" | Set<Key>) => void;
    footer?: Entry[];
  }

  /** The drag column's cell: a button while the table takes drags, nothing otherwise. */
  function DragCell() {
    const grid = useTable();
    return <Cell>{() => (grid.allowsDragging() ? <DragButton>=</DragButton> : null)}</Cell>;
  }

  function Draggable(props: DnDProps) {
    const { dragAndDropHooks } = dragAndDrop<Entry>({
      getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
      ...props.options,
    });
    return (
      <Table
        aria-label={props.label ?? "Files"}
        columns={DND_COLUMNS}
        items={props.items ?? ENTRIES}
        selectionMode={props.selectionMode ?? "none"}
        disabledKeys={props.disabledKeys}
        treeColumn={props.treeColumn}
        defaultExpandedKeys={props.defaultExpandedKeys}
        onSelectionChange={props.onSelectionChange}
        dragAndDropHooks={dragAndDropHooks}
      >
        <TableHeader>{(column: Column_) => <Column>{column.name}</Column>}</TableHeader>
        <TableBody>
          {(entry: Entry) => (
            <Row>
              {(column: Column_) =>
                column.id === "drag" ? (
                  <DragCell />
                ) : (
                  <Cell>
                    {column.id === "name" && entry.children !== undefined ? (
                      <TableExpandButton>+</TableExpandButton>
                    ) : null}
                    {String(entry[column.id])}
                  </Cell>
                )
              }
            </Row>
          )}
        </TableBody>
        {props.footer === undefined ? null : (
          <TableFooter items={props.footer}>
            {(total: Entry) => (
              <Row>{(column: Column_) => <Cell>{String(total[column.id] ?? "")}</Cell>}</Row>
            )}
          </TableFooter>
        )}
      </Table>
    );
  }

  const indicator = (target: DropTarget) => (
    <DropIndicator target={target} class="indicator">
      Test
    </DropIndicator>
  );

  /** One key, down and up, with no click on a focused button. */
  function hit(key: string, options: { altKey?: boolean } = {}): void {
    user.keyDown(key, options);
    user.keyUp(key, options);
  }

  function focusedLabel(): string | null | undefined {
    return document.activeElement?.getAttribute("aria-label");
  }

  function rowOf(grid: HTMLElement, key: Key): HTMLElement {
    const found = grid.querySelector(`[role="row"][data-key="${String(key)}"]`);
    if (!(found instanceof HTMLElement)) throw new Error(`no row ${String(key)}`);
    return found;
  }

  function labels(root: ParentNode, selector: string): (string | null)[] {
    return [...root.querySelectorAll(selector)].map((each) =>
      (each.querySelector('[role="button"]') ?? each).getAttribute("aria-label"),
    );
  }

  /** Into the first table, which lands on its first cell's drag button, and Enter. */
  async function startDrag(): Promise<void> {
    user.tab();
    flush();
    expect(document.activeElement?.getAttribute("data-slot")).toBe("drag");
    hit("Enter");
    await nextFrame();
  }

  afterEach(async () => {
    if (dragSession() !== null) hit("Escape");
    await nextFrame();
    restoreRects();
    clearAnnouncer();
  });

  test("a row's drag button is in a cell and named after the row", () => {
    render(() => <Draggable />);
    const grid = screen.getByRole("grid");
    expect(grid.hasAttribute("data-allows-dragging")).toBe(true);
    const games = rowOf(grid, "1");
    const handle = within(games).getByRole("button", { name: "Drag Games" });
    expect(handle.closest('[role="gridcell"]')).not.toBeNull();
    // The row is not a focus stop here: the drag button's cell is.
    expect(games.hasAttribute("tabindex")).toBe(false);
  });

  test("a pointer drag starts anywhere on a row by default", async () => {
    const onDragStart = mock();
    render(() => <Draggable options={{ onDragStart }} />);
    const games = rowOf(screen.getByRole("grid"), "1");
    const handle = within(games).getByRole("button", { name: "Drag Games" });
    expect(games.getAttribute("draggable")).toBe("true");
    expect(handle.hasAttribute("draggable")).toBe(false);
    expect(handle.style.pointerEvents).toBe("none");

    const dataTransfer = new MockDataTransfer();
    fireDrag(within(games).getByRole("rowheader"), "dragstart", { dataTransfer });
    await nextFrame();
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(games.hasAttribute("data-dragging")).toBe(true);
    fireDrag(games, "dragend", { dataTransfer });
    expect(games.hasAttribute("data-dragging")).toBe(false);
  });

  test("with a handle, only the drag button starts a pointer drag", async () => {
    const onDragStart = mock((_event: { keys: Set<Key> }) => {});
    render(() => <Draggable options={{ pointerDragSource: "handle", onDragStart }} />);
    const games = rowOf(screen.getByRole("grid"), "1");
    const handle = within(games).getByRole("button", { name: "Drag Games" });
    expect(games.hasAttribute("draggable")).toBe(false);
    expect(handle.getAttribute("draggable")).toBe("true");
    expect(handle.style.pointerEvents).toBe("");

    fireDrag(within(games).getByRole("rowheader"), "dragstart", {
      dataTransfer: new MockDataTransfer(),
    });
    expect(onDragStart).not.toHaveBeenCalled();
    expect(games.hasAttribute("data-dragging")).toBe(false);

    const dataTransfer = new MockDataTransfer();
    fireDrag(handle, "dragstart", { dataTransfer });
    await nextFrame();
    expect([...(onDragStart.mock.calls[0]?.[0].keys ?? [])]).toEqual(["1"]);
    expect(games.hasAttribute("data-dragging")).toBe(true);
    // Without a preview of its own, the whole row is photographed.
    expect(dataTransfer.dragImage?.node).toBe(games);
    fireDrag(handle, "dragend", { dataTransfer });
    expect(games.hasAttribute("data-dragging")).toBe(false);
  });

  test("with a handle, pressing the drag button does not select the row", () => {
    const onSelectionChange = mock();
    render(() => (
      <Draggable
        selectionMode="multiple"
        onSelectionChange={onSelectionChange}
        options={{ pointerDragSource: "handle" }}
      />
    ));
    const games = rowOf(screen.getByRole("grid"), "1");
    user.click(within(games).getByRole("button", { name: "Drag Games" }));
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(games.getAttribute("aria-selected")).toBe("false");
  });

  test("the drag button starts a keyboard drag with a handle too", async () => {
    const onDragStart = mock();
    render(() => <Draggable options={{ pointerDragSource: "handle", onDragStart }} />);
    await startDrag();
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  test("renders drop indicators as rows, and reorders from the keyboard", async () => {
    const onReorder = mock((_event: DroppableCollectionReorderEvent) => {});
    render(() => <Draggable options={{ onReorder, renderDropIndicator: indicator }} />);
    await startDrag();

    const grid = screen.getByRole("grid");
    const shown = [...grid.querySelectorAll(".indicator")];
    expect(labels(grid, ".indicator")).toEqual([
      "Insert before Games",
      "Insert between Games and Program Files",
      "Insert between Program Files and bootmgr",
      "Insert after bootmgr",
    ]);
    expect(shown[0]?.getAttribute("role")).toBe("row");
    expect(shown[0]?.querySelector('[role="gridcell"]')?.getAttribute("aria-colspan")).toBe("4");
    expect(shown[0]?.textContent).toBe("Test");
    expect(shown[1]?.hasAttribute("data-drop-target")).toBe(true);
    expect(focusedLabel()).toBe("Insert between Games and Program Files");

    hit("ArrowDown");
    expect(focusedLabel()).toBe("Insert between Program Files and bootmgr");
    expect(shown[1]?.hasAttribute("data-drop-target")).toBe(false);
    expect(shown[2]?.hasAttribute("data-drop-target")).toBe(true);

    hit("Enter");
    await nextFrame();
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect([...(onReorder.mock.calls[0]?.[0].keys ?? [])]).toEqual(["1"]);
    expect(onReorder.mock.calls[0]?.[0].target).toEqual({
      type: "item",
      key: "3",
      dropPosition: "before",
    });
  });

  test("does not skip drop positions next to a disabled row", async () => {
    render(() => <Draggable disabledKeys={["2"]} options={{ onReorder: () => {} }} />);
    await startDrag();
    expect(focusedLabel()).toBe("Insert between Games and Program Files");
    hit("ArrowDown");
    expect(focusedLabel()).toBe("Insert between Program Files and bootmgr");
    hit("ArrowDown");
    expect(focusedLabel()).toBe("Insert after bootmgr");
  });

  test("drops on a row of another table", async () => {
    const onItemDrop = mock();
    render(() => (
      <>
        <Draggable label="From" />
        <Draggable label="To" options={{ onItemDrop }} />
      </>
    ));
    await startDrag();

    const to = screen.getByRole("grid", { name: "To" });
    expect(labels(to, '[role="button"][aria-label^="Drop on"]')).toEqual([
      "Drop on Games",
      "Drop on Program Files",
      "Drop on bootmgr",
    ]);
    // The target for a row is a row of its own, just before it.
    const target = to.querySelector('[aria-label="Drop on Games"]')?.closest('[role="row"]');
    expect(target?.nextElementSibling).toBe(rowOf(to, "1"));
    expect(rowOf(to, "1").hasAttribute("data-drop-target")).toBe(true);
    expect(rowOf(to, "2").hasAttribute("data-drop-target")).toBe(false);
    expect(focusedLabel()).toBe("Drop on Games");

    hit("Enter");
    await nextFrame();
    expect(onItemDrop.mock.calls[0]?.[0]).toMatchObject({
      isInternal: false,
      target: { type: "item", key: "1", dropPosition: "on" },
    });
  });

  test("drops on another table itself", async () => {
    const onRootDrop = mock();
    render(() => (
      <>
        <Draggable label="From" />
        <Draggable label="To" options={{ onRootDrop }} />
      </>
    ));
    await startDrag();

    const to = screen.getByRole("grid", { name: "To" });
    const active = document.activeElement as HTMLElement;
    expect(to.contains(active)).toBe(true);
    expect(active.getAttribute("aria-label")).toBe("Drop on");
    expect(active.getAttribute("aria-labelledby")).toBe(`${active.id} ${to.id}`);
    expect(to.hasAttribute("data-drop-target")).toBe(true);
    expect(within(to).getAllByRole("rowgroup")[1]?.hasAttribute("data-drop-target")).toBe(true);

    hit("Enter");
    await nextFrame();
    expect(onRootDrop).toHaveBeenCalledTimes(1);
    expect(to.hasAttribute("data-drop-target")).toBe(false);
  });

  test("drop targets are walked with the arrows, Home and End", async () => {
    render(() => (
      <>
        <Draggable label="From" />
        <Draggable label="To" options={{ onInsert: () => {}, onRootDrop: () => {} }} />
      </>
    ));
    await startDrag();
    // The only table that takes a drop, with nothing focused in it: its first place.
    expect(focusedLabel()).toBe("Drop on");

    const names = ["Games", "Program Files", "bootmgr"];
    const between = (at: number): string =>
      at === 0
        ? `Insert before ${names[0]}`
        : at === names.length
          ? `Insert after ${names[at - 1]}`
          : `Insert between ${names[at - 1]} and ${names[at]}`;

    for (let at = 0; at <= names.length; at++) {
      hit("ArrowDown");
      expect(focusedLabel()).toBe(between(at));
    }
    hit("Home");
    expect(focusedLabel()).toBe("Drop on");
    for (let at = names.length; at >= 0; at--) {
      hit("ArrowUp");
      expect(focusedLabel()).toBe(between(at));
    }
    hit("End");
    expect(focusedLabel()).toBe("Insert after bootmgr");
    hit("ArrowDown");
    expect(focusedLabel()).toBe("Drop on");
  });

  test("what a drop inserts is selected, and focus goes to one of its cells", async () => {
    const [entries, setEntries] = createSignal<Entry[]>([...ENTRIES]);
    render(() => (
      <>
        <Draggable
          label="From"
          items={[{ id: "a", name: "Acme", type: "File", modified: "Now" }]}
        />
        <Draggable
          label="To"
          selectionMode="multiple"
          items={entries()}
          options={{
            onInsert: (event) => {
              const at = entries().findIndex((each) => each.id === event.target.key);
              const next = [...entries()];
              next.splice(at, 0, { id: "salama", name: "Salama", type: "File", modified: "Now" });
              setEntries(next);
            },
          }}
        />
      </>
    ));
    await startDrag();
    expect(focusedLabel()).toBe("Insert before Games");
    hit("Enter");
    await nextFrame();
    await new Promise((resolve) => setTimeout(resolve, 60));
    flush();

    const to = screen.getByRole("grid", { name: "To" });
    const salama = rowOf(to, "salama");
    expect(salama.getAttribute("aria-selected")).toBe("true");
    expect(
      [...to.querySelectorAll('[role="row"][data-key]')].filter(
        (each) => each.getAttribute("aria-selected") === "true",
      ),
    ).toHaveLength(1);
    expect(salama.contains(document.activeElement)).toBe(true);
  });

  test("a pointer drag past the last row targets after it", async () => {
    stubRects(function (this: HTMLElement) {
      const grid = this.closest('[role="grid"]');
      const rows = grid === null ? [] : [...grid.querySelectorAll('[role="row"][data-key]')];
      const index = rows.indexOf(this);
      if (index < 0) {
        return { left: 0, right: 400, top: 0, bottom: 200, x: 0, y: 0, width: 400, height: 200 };
      }
      const top = index * 25;
      return { left: 0, right: 400, top, bottom: top + 25, x: 0, y: top, width: 400, height: 25 };
    });
    const onInsert = mock();
    render(() => (
      <>
        <Draggable label="From" items={[{ id: "a1", name: "One", type: "", modified: "" }]} />
        <Draggable
          label="To"
          items={[
            { id: "b1", name: "Two", type: "", modified: "" },
            { id: "b2", name: "Three", type: "", modified: "" },
          ]}
          options={{ onInsert }}
        />
      </>
    ));
    const from = screen.getByRole("grid", { name: "From" });
    const to = screen.getByRole("grid", { name: "To" });
    const dataTransfer = new MockDataTransfer();
    fireDrag(rowOf(from, "a1"), "dragstart", { dataTransfer, clientX: 5, clientY: 5 });
    fireDrag(to, "dragenter", { dataTransfer, clientX: 100, clientY: 50 });
    fireDrag(to, "dragover", { dataTransfer, clientX: 100, clientY: 50 });
    fireDrag(to, "dragover", { dataTransfer, clientX: 70, clientY: 50 });
    fireDrag(to, "dragover", { dataTransfer, clientX: 70, clientY: 75 });
    fireDrag(to, "drop", { dataTransfer, clientX: 70, clientY: 75 });
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert.mock.calls[0]?.[0]).toMatchObject({
      target: { type: "item", key: "b2", dropPosition: "after" },
    });
    fireDrag(rowOf(from, "a1"), "dragend", { dataTransfer });
  });

  test("a disabled drag and drop makes nothing draggable, and selection still works", () => {
    render(() => <Draggable selectionMode="multiple" options={{ isDisabled: true }} />);
    const grid = screen.getByRole("grid");
    expect(grid.hasAttribute("data-allows-dragging")).toBe(false);
    for (const each of grid.querySelectorAll('[role="row"][data-key]')) {
      expect(each.hasAttribute("draggable")).toBe(false);
    }
    for (const handle of within(grid).getAllByRole("button", { name: /^Drag / })) {
      expect((handle as HTMLButtonElement).disabled).toBe(true);
    }
    user.click(within(rowOf(grid, "1")).getByRole("rowheader"));
    expect(rowOf(grid, "1").getAttribute("aria-selected")).toBe("true");
  });

  test("the footer's rows take no part", async () => {
    render(() => (
      <Draggable
        footer={[{ id: "total", name: "Total", type: "", modified: "" }]}
        options={{ onReorder: () => {}, renderDropIndicator: indicator }}
      />
    ));
    const grid = screen.getByRole("grid");
    expect(rowOf(grid, "total").hasAttribute("draggable")).toBe(false);
    await startDrag();
    expect(labels(grid, ".indicator")).toEqual([
      "Insert before Games",
      "Insert between Games and Program Files",
      "Insert between Program Files and bootmgr",
      "Insert after bootmgr",
    ]);
  });

  test("a drop on a row gives focus to a cell of it", async () => {
    const onItemDrop = mock();
    render(() => (
      <>
        <Draggable label="From" />
        <Draggable label="To" options={{ onItemDrop }} />
      </>
    ));
    await startDrag();
    hit("ArrowDown");
    expect(focusedLabel()).toBe("Drop on Program Files");
    hit("Enter");
    await nextFrame();
    await new Promise((resolve) => setTimeout(resolve, 60));
    flush();
    const to = screen.getByRole("grid", { name: "To" });
    expect(rowOf(to, "2").contains(document.activeElement)).toBe(true);
  });

  describe("with rows that nest", () => {
    test("level-aware positions, at the end of each branch", async () => {
      render(() => (
        <>
          <Draggable label="From" items={[{ id: "a", name: "Acme", type: "", modified: "" }]} />
          <Draggable
            label="To"
            items={NESTED}
            treeColumn="name"
            defaultExpandedKeys={["documents"]}
            options={{ onInsert: () => {}, renderDropIndicator: indicator }}
          />
        </>
      ));
      await startDrag();
      const to = screen.getByRole("treegrid", { name: "To" });
      const shown = [...to.querySelectorAll(".indicator")].map((each) => [
        each.querySelector('[role="button"]')?.getAttribute("aria-label"),
        each.getAttribute("aria-level"),
      ]);
      expect(shown).toEqual([
        ["Insert before Documents", "1"],
        ["Insert before Taxes", "2"],
        ["Insert between Taxes and Letters", "2"],
        ["Insert after Letters", "2"],
        ["Insert between Documents and Music", "1"],
        ["Insert after Music", "1"],
      ]);
    });

    test("a row cannot be dropped into its own branch", async () => {
      render(() => (
        <Draggable
          items={NESTED}
          treeColumn="name"
          defaultExpandedKeys={["documents"]}
          options={{ onMove: () => {} }}
        />
      ));
      await startDrag();
      const offered = labels(
        screen.getByRole("treegrid"),
        '[role="button"][aria-label^="Drop on"]',
      );
      expect(offered).toEqual(["Drop on Music"]);
    });

    test("Right opens a collapsed row mid-drag and Left closes it; Alt + Enter opens it too", async () => {
      const onDropActivate = mock();
      render(() => (
        <>
          <Draggable label="From" items={[{ id: "a", name: "Acme", type: "", modified: "" }]} />
          <Draggable
            label="To"
            items={NESTED}
            treeColumn="name"
            options={{ onItemDrop: () => {}, onDropActivate }}
          />
        </>
      ));
      await startDrag();
      const to = screen.getByRole("treegrid", { name: "To" });
      expect(focusedLabel()).toBe("Drop on Documents");
      expect(to.querySelector('[data-key="taxes"]')).toBeNull();

      hit("ArrowRight");
      await nextFrame();
      expect(rowOf(to, "documents").getAttribute("aria-expanded")).toBe("true");
      hit("ArrowDown");
      await nextFrame();
      expect(focusedLabel()).toBe("Drop on Taxes");

      hit("ArrowUp");
      hit("ArrowLeft");
      await nextFrame();
      expect(rowOf(to, "documents").getAttribute("aria-expanded")).toBe("false");
      expect(onDropActivate).not.toHaveBeenCalled();

      hit("Enter", { altKey: true });
      await nextFrame();
      expect(rowOf(to, "documents").getAttribute("aria-expanded")).toBe("true");
      expect(onDropActivate.mock.calls[0]?.[0]).toMatchObject({
        target: { type: "item", key: "documents", dropPosition: "on" },
      });
    });

    test("a pointer drag held over a collapsed row opens it", async () => {
      stubRects(function (this: HTMLElement) {
        const grid = this.closest('[role="grid"], [role="treegrid"]');
        const rows = grid === null ? [] : [...grid.querySelectorAll('[role="row"][data-key]')];
        const index = rows.indexOf(this);
        if (index < 0) {
          return { left: 0, right: 400, top: 0, bottom: 200, x: 0, y: 0, width: 400, height: 200 };
        }
        const top = index * 50;
        return { left: 0, right: 400, top, bottom: top + 50, x: 0, y: top, width: 400, height: 50 };
      });
      render(() => (
        <>
          <Draggable label="From" items={[{ id: "a", name: "Acme", type: "", modified: "" }]} />
          <Draggable
            label="To"
            items={NESTED}
            treeColumn="name"
            options={{ onItemDrop: () => {} }}
          />
        </>
      ));
      const from = screen.getByRole("grid", { name: "From" });
      const to = screen.getByRole("treegrid", { name: "To" });
      const dataTransfer = new MockDataTransfer();
      fireDrag(rowOf(from, "a"), "dragstart", { dataTransfer });
      fireDrag(to, "dragenter", { dataTransfer, clientX: 100, clientY: 25 });
      fireDrag(to, "dragover", { dataTransfer, clientX: 100, clientY: 26 });
      expect(rowOf(to, "documents").hasAttribute("data-drop-target")).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 850));
      flush();
      expect(rowOf(to, "documents").getAttribute("aria-expanded")).toBe("true");
      fireDrag(rowOf(from, "a"), "dragend", { dataTransfer });
    });
  });
});
