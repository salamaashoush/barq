import { describe, expect, test } from "bun:test";
import { flush, signal, type Incoming } from "@barqjs/core";
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
import { Cell, Column, Row, Table, TableBody, TableHeader, type SortDescriptor } from "./table.tsx";

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

function Files(
  props: Incoming<{
    selectionMode?: "none" | "single" | "multiple";
    sortDescriptor?: SortDescriptor;
    onSortChange?: (descriptor: SortDescriptor) => void;
    onSelectionChange?: (keys: "all" | Set<Key>) => void;
    onAction?: (key: Key) => void;
  }>,
) {
  return (
    <Table
      aria-label="Files"
      columns={COLUMNS}
      items={FILES}
      selectionMode={props.selectionMode?.() ?? "none"}
      sortDescriptor={props.sortDescriptor?.()}
      onSortChange={props.onSortChange?.()}
      onSelectionChange={props.onSelectionChange?.()}
      onAction={props.onAction?.()}
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
    const sort = signal<SortDescriptor | undefined>(undefined);
    const changes: SortDescriptor[] = [];
    render(() => (
      <Files
        sortDescriptor={sort()}
        onSortChange={(descriptor) => {
          changes.push(descriptor);
          sort.set(descriptor);
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
    const enabled = signal(false);

    render(() => <Files onAction={enabled() ? (key: Key) => acted.push(key) : undefined} />);

    user.click(cell("Budget", "Name"));
    expect(acted, "an action ran before one was declared").toEqual([]);

    enabled.set(true);
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
