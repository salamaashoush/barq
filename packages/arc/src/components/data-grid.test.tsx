import { describe, expect, test } from "bun:test";
import { type Child, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";

import { touch } from "@barqjs/ui/shared-touch";

import { hydrates, settle, wears } from "../test-arc.ts";
import {
  DataGrid,
  type DataGridChange,
  type DataGridColumn,
  type DataGridColumnGroup,
} from "./data-grid.tsx";

interface Line {
  id: string;
  item: string;
  team: string;
  q1: number;
  q2: number;
  approved: boolean;
}

const LINES: Line[] = [
  { id: "a", item: "Laptops", team: "eng", q1: 10, q2: 20, approved: true },
  { id: "b", item: "Desks", team: "ops", q1: 5, q2: 5, approved: false },
  { id: "c", item: "Monitors", team: "eng", q1: 7, q2: 3, approved: false },
];

const COLUMNS: (DataGridColumn<Line> | DataGridColumnGroup<Line>)[] = [
  {
    id: "item",
    header: "Item",
    frozen: true,
    validate: (value) => (value === "" ? "Name it" : undefined),
  },
  {
    id: "team",
    header: "Team",
    type: "select",
    options: [
      { value: "eng", label: "Engineering" },
      { value: "ops", label: "Operations" },
    ],
  },
  {
    id: "plan",
    header: "Plan",
    columns: [
      { id: "q1", header: "Q1", type: "number", total: "sum" },
      { id: "q2", header: "Q2", type: "number", total: "sum" },
    ],
  },
  { id: "approved", header: "Approved", type: "checkbox" },
];

function Budget(props: { groupBy?: string; onAdd?: () => void; virtual?: boolean }) {
  const [lines, setLines] = createSignal<Line[]>(LINES.map((line) => ({ ...line })));
  const [dirty, setDirty] = createSignal<ReadonlySet<string>>(new Set());
  const apply = (changes: DataGridChange<Line>[]) => {
    changed.push(...changes);
    const next = lines().map((line) => ({ ...line }));
    for (const one of changes) {
      const line = next.find((each) => each.id === one.rowId);
      if (line !== undefined) (line as unknown as Record<string, unknown>)[one.field] = one.value;
    }
    setLines(next);
    setDirty(new Set([...dirty(), ...changes.map((one) => `${one.rowId}:${one.columnId}`)]));
  };
  return (
    <DataGrid
      label="Budget"
      data={lines()}
      getRowId={(line: Line) => line.id}
      columns={COLUMNS}
      groupBy={props.groupBy}
      dirtyCells={dirty()}
      onCellsChange={apply}
      onAddRow={props.onAdd}
      virtualRowHeight={props.virtual === true ? 36 : undefined}
    />
  );
}

let changed: DataGridChange<Line>[] = [];

function cell(row: number, column: number): HTMLElement {
  const rows = screen.getAllByRole("row").filter((one) => one.querySelector('[role="gridcell"]'));
  return within(rows[row] as HTMLElement).getAllByRole("gridcell")[column] as HTMLElement;
}

async function key(text: string, options: { shiftKey?: boolean; ctrlKey?: boolean } = {}) {
  await user.keyboard(text, options);
  await settle();
}

async function start(): Promise<void> {
  changed = [];
  user.click(cell(0, 0));
  await settle();
}

describe("DataGrid", () => {
  test("a named grid with grouped headers, frozen first column, totals and one Tab stop", async () => {
    render(() => <Budget />);
    const grid = screen.getByRole("grid", { name: "Budget" });
    const headers = within(grid)
      .getAllByRole("columnheader")
      .map((one) => one.textContent);
    expect(headers).toContain("Plan");
    expect(within(grid).getByRole("columnheader", { name: "Plan" }).getAttribute("colspan")).toBe(
      "2",
    );
    expect(cell(0, 1).textContent).toBe("Engineering");
    expect(cell(0, 2).textContent).toBe("10");
    const totals = document.querySelector('[data-slot="data-grid-totals"]') as HTMLElement;
    expect(totals.textContent).toContain("22");
    expect(totals.textContent).toContain("28");
    await start();
    expect(document.activeElement).toBe(cell(0, 0));
    expect(cell(0, 0).getAttribute("aria-selected")).toBe("true");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the arrows move a cell, Shift grows a range, Home and End go to the row's ends", async () => {
    render(() => <Budget />);
    await start();
    await key("{ArrowRight}");
    expect(document.activeElement).toBe(cell(0, 1));
    await key("{ArrowDown}");
    expect(document.activeElement).toBe(cell(1, 1));
    await key("{ArrowRight}", { shiftKey: true });
    await key("{ArrowDown}", { shiftKey: true });
    expect(
      [cell(1, 1), cell(1, 2), cell(2, 1), cell(2, 2)].every(
        (one) => one.getAttribute("aria-selected") === "true",
      ),
    ).toBe(true);
    await key("{End}");
    expect(document.activeElement).toBe(cell(1, 4));
    await key("{Home}");
    expect(document.activeElement).toBe(cell(1, 0));
  });

  test("Enter edits, Enter saves and goes down, Escape lets go, and a typed key replaces", async () => {
    render(() => <Budget />);
    await start();
    await key("{ArrowRight}{ArrowRight}");
    await key("{Enter}");
    const editor = screen.getByRole<HTMLInputElement>("textbox", { name: "Q1" });
    expect(editor.value).toBe("10");
    editor.value = "12";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    await key("{Enter}");
    expect(changed.map((one) => [one.rowId, one.field, one.value])).toEqual([["a", "q1", 12]]);
    expect(document.activeElement).toBe(cell(1, 2));
    expect(cell(0, 2).hasAttribute("data-dirty")).toBe(true);

    await key("9");
    const typed = screen.getByRole<HTMLInputElement>("textbox", { name: "Q1" });
    expect(typed.value).toBe("9");
    await key("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Q1" })).toBeNull();
    expect(changed).toHaveLength(1);
  });

  test("F2 edits, a refused value keeps the editor open with the reason, and Tab saves and moves on", async () => {
    render(() => <Budget />);
    await start();
    await key("{F2}");
    const editor = screen.getByRole<HTMLInputElement>("textbox", { name: "Item" });
    editor.value = "";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    await key("{Enter}");
    expect(screen.getByRole("alert").textContent).toBe("Name it");
    editor.value = "Chairs";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    await key("{Tab}");
    expect(changed.at(-1)?.value).toBe("Chairs");
    expect(document.activeElement).toBe(cell(0, 1));
  });

  test("a select cell edits with its options, and Space ticks a checkbox", async () => {
    render(() => <Budget />);
    await start();
    await key("{ArrowRight}{Enter}");
    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: "Team" });
    select.value = "ops";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    await key("{Enter}");
    expect(changed.at(-1)).toMatchObject({ rowId: "a", field: "team", value: "ops" });
    await key("{ArrowUp}{End}");
    await key(" ");
    expect(changed.at(-1)).toMatchObject({ rowId: "a", field: "approved", value: false });
  });

  test("Mod+C copies the range as text and a paste fills from the focused cell", async () => {
    const written: string[] = [];
    const clipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => void written.push(text) },
    });
    render(() => <Budget />);
    await start();
    await key("{ArrowRight}{ArrowRight}");
    await key("{ArrowRight}{ArrowDown}", { shiftKey: true });
    await key("c", { ctrlKey: true });
    expect(written).toEqual(["10\t20\n5\t5"]);
    expect(screen.getByRole("status").textContent).toBe("Copied 4 cells");
    await key("{ArrowDown}{ArrowDown}");
    const paste = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, "clipboardData", { value: { getData: () => "1\t2\nx\t4\n" } });
    document.activeElement?.dispatchEvent(paste);
    await settle();
    expect(changed.map((one) => [one.rowId, one.field, one.value])).toEqual([
      ["c", "q1", 1],
      ["c", "q2", 2],
    ]);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
  });

  test("Delete clears the range it can edit", async () => {
    render(() => <Budget />);
    await start();
    await key("{ArrowRight}{ArrowRight}");
    await key("{ArrowRight}", { shiftKey: true });
    await key("{Delete}");
    expect(changed.map((one) => [one.field, one.value])).toEqual([
      ["q1", null],
      ["q2", null],
    ]);
  });

  test("groups rows by a column, each group a row with its totals that folds", async () => {
    render(() => <Budget groupBy="team" />);
    const groups = document.querySelectorAll('[data-slot="data-grid-group"]');
    expect(groups).toHaveLength(2);
    expect(groups[0]?.textContent).toContain("eng (2)");
    expect(groups[0]?.textContent).toContain("17");
    const fold = screen.getByRole("button", { name: "eng, 2 rows" });
    await user.click(fold);
    await settle();
    expect(groups[0]?.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelectorAll('[data-slot="data-grid-row"]')).toHaveLength(1);
  });

  test("a tap selects a cell, and Add row, a finger's size, asks for a row", async () => {
    let added = 0;
    render(() => <Budget onAdd={() => void added++} />);
    const add = screen.getByRole("button", { name: "Add row" });
    expect(wears(add, touch.target)).toBe(true);
    user.tap(cell(1, 1));
    await settle();
    expect(cell(1, 1).getAttribute("aria-selected")).toBe("true");
    user.tap(add);
    await settle();
    expect(added).toBe(1);
  });

  test("draws only the rows on screen when virtual", () => {
    render(() => <Budget virtual />);
    expect(
      document.querySelector('[data-slot="data-grid-scroller"]')?.getAttribute("style"),
    ).toContain("28rem");
    expect(document.querySelectorAll('[data-slot="data-grid-row"]').length).toBeGreaterThan(0);
  });

  test("right to left, the arrows follow the reading direction", async () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <Budget />
      </Arabic>
    ));
    await start();
    await key("{ArrowLeft}");
    expect(document.activeElement).toBe(cell(0, 1));
    expect(cell(0, 2).textContent).toBe("١٠");
  });

  test("takes a class per part", () => {
    render(() => (
      <DataGrid
        label="Budget"
        class="mine"
        classes={{ root: "r", scroller: "s", table: "t", cell: "c", total: "o" }}
        data={LINES}
        getRowId={(line: Line) => line.id}
        columns={COLUMNS}
      />
    ));
    for (const [name, cls] of [
      ["data-grid", "r"],
      ["data-grid-scroller", "s"],
      ["data-grid-table", "t"],
      ["data-grid-cell", "c"],
    ] as const) {
      expect(document.querySelector(`[data-slot="${name}"]`)?.classList.contains(cls)).toBe(true);
    }
    expect(document.querySelector(".o")).not.toBeNull();
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { DataGrid } from "<arc>";
      export function Page() {
        return (
          <DataGrid
            label="Budget"
            data={[{ id: "a", item: "Laptops", q1: 10 }]}
            getRowId={(line) => line.id}
            columns={[{ id: "item", header: "Item" }, { id: "q1", header: "Q1", type: "number", total: "sum" }]}
          />
        );
      }
    `);
    await waitFor(() => expect(result.container.querySelector('[role="grid"]')).not.toBeNull());
    result.unmount();
  });
});
