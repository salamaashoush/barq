import { afterEach, describe, expect, test } from "bun:test";
import { For, Show, flush } from "@barqjs/core";

import {
  type Features,
  type Mounted,
  type Person,
  click,
  features,
  mount,
  people,
  person,
  type,
  unmountAll,
} from "./fixtures.ts";
import {
  type BarqTable,
  type Cell,
  type ColumnDef,
  type Header,
  type HeaderGroup,
  type Row,
  type TableOptions,
  FlexRender,
  createTable,
} from "./index.ts";

afterEach(unmountAll);

const columns: Array<ColumnDef<Features, Person>> = [
  { accessorKey: "name", header: "Name", footer: "people" },
  {
    accessorKey: "age",
    header: "Age",
    aggregationFn: "sum",
    aggregatedCell: (context) => `sum:${context.getValue<number>()}`,
  },
  {
    accessorKey: "team",
    header: "Team",
    cell: (context) => `team:${context.getValue<string>()}`,
  },
];

let table: BarqTable<Features, Person>;

function Grid(props: { options?: () => Partial<TableOptions<Features, Person>> }) {
  table = createTable(() => ({
    features,
    columns,
    data: people,
    getRowId: (row: Person) => row.id,
    ...props.options?.(),
  }));

  return (
    <div>
      <input
        data-testid="global"
        onInput={(event) => table.setGlobalFilter(event.currentTarget.value)}
      />
      <table>
        <thead>
          <For each={table.getHeaderGroups()}>
            {(group: HeaderGroup<Features, Person>) => (
              <tr>
                <th>
                  <input
                    type="checkbox"
                    data-testid="all"
                    checked={table.getIsAllRowsSelected()}
                    onChange={table.getToggleAllRowsSelectedHandler()}
                  />
                </th>
                <For each={group.headers}>
                  {(header: Header<Features, Person>) => (
                    <th
                      data-col={header.column.id}
                      data-pinned={`${header.column.getIsPinned()}`}
                      data-size={header.getSize()}
                      data-start={header.getStart()}
                    >
                      <button
                        type="button"
                        data-testid={`sort-${header.column.id}`}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <FlexRender header={header} />
                      </button>
                      <span class="sorted">
                        {`${header.column.getIsSorted()}:${header.column.getSortIndex()}`}
                      </span>
                      <input
                        data-testid={`filter-${header.column.id}`}
                        onInput={(event) => header.column.setFilterValue(event.currentTarget.value)}
                      />
                    </th>
                  )}
                </For>
              </tr>
            )}
          </For>
        </thead>
        <tbody>
          <For each={table.getRowModel().rows}>
            {(row: Row<Features, Person>) => (
              <tr data-id={row.id} data-depth={row.depth} data-selected={`${row.getIsSelected()}`}>
                <td>
                  <input
                    type="checkbox"
                    data-testid={`select-${row.id}`}
                    checked={row.getIsSelected()}
                    onChange={row.getToggleSelectedHandler()}
                  />
                  <Show when={row.getCanExpand()}>
                    <button
                      type="button"
                      data-testid={`expand-${row.id}`}
                      onClick={row.getToggleExpandedHandler()}
                    >
                      {row.getIsExpanded() ? "collapse" : "expand"}
                    </button>
                  </Show>
                </td>
                <For each={row.getVisibleCells()}>
                  {(cell: Cell<Features, Person>) => (
                    <td data-col={cell.column.id} data-grouped={`${cell.getIsGrouped()}`}>
                      <FlexRender cell={cell} />
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <output data-testid="page">
        {`${table.atoms.pagination.get().pageIndex + 1}/${table.getPageCount()} size ${
          table.atoms.pagination.get().pageSize
        } rows ${table.getRowCount()}`}
      </output>
      <output data-testid="selected">
        {Object.keys(table.atoms.rowSelection.get()).join(",")}
      </output>
      <button
        type="button"
        data-testid="previous"
        disabled={!table.getCanPreviousPage()}
        onClick={() => table.previousPage()}
      >
        previous
      </button>
      <button
        type="button"
        data-testid="next"
        disabled={!table.getCanNextPage()}
        onClick={() => table.nextPage()}
      >
        next
      </button>
    </div>
  );
}

const grid = (options?: Partial<TableOptions<Features, Person>>): Mounted =>
  mount(() => <Grid options={options} />);

const names = (view: Mounted): string[] => view.text('tbody td[data-col="name"]');
const testid = (view: Mounted, id: string): HTMLElement => view.one(`[data-testid="${id}"]`);
const field = (view: Mounted, id: string): HTMLInputElement => testid(view, id) as HTMLInputElement;
const button = (view: Mounted, id: string): HTMLButtonElement =>
  testid(view, id) as HTMLButtonElement;
const run = (action: () => void): void => {
  action();
  flush();
};

describe("sorting", () => {
  test("a header click cycles ascending, descending, unsorted", () => {
    const view = grid();
    expect(names(view)).toEqual(["salama", "ada", "zed", "lin", "omar"]);

    click(testid(view, "sort-name"));
    expect(names(view)).toEqual(["ada", "lin", "omar", "salama", "zed"]);
    expect(view.one('th[data-col="name"] .sorted').textContent).toBe("asc:0");

    click(testid(view, "sort-name"));
    expect(names(view)).toEqual(["zed", "salama", "omar", "lin", "ada"]);
    expect(view.one('th[data-col="name"] .sorted').textContent).toBe("desc:0");

    click(testid(view, "sort-name"));
    expect(names(view)).toEqual(["salama", "ada", "zed", "lin", "omar"]);
    expect(view.one('th[data-col="name"] .sorted').textContent).toBe("false:-1");
  });

  test("a shift click adds a second sort", () => {
    const view = grid();
    click(testid(view, "sort-team"));
    click(testid(view, "sort-age"), { shiftKey: true });

    expect(table.store.state.sorting).toEqual([
      { id: "team", desc: false },
      { id: "age", desc: true },
    ]);
    expect(names(view)).toEqual(["salama", "zed", "ada", "lin", "omar"]);
    expect(view.one('th[data-col="team"] .sorted').textContent).toBe("asc:0");
    expect(view.one('th[data-col="age"] .sorted').textContent).toBe("desc:1");

    click(testid(view, "sort-name"));
    expect(table.store.state.sorting).toEqual([{ id: "name", desc: false }]);
    expect(view.one('th[data-col="team"] .sorted').textContent).toBe("false:-1");
  });

  test("the state written is readable in the same tick", () => {
    grid();
    table.setSorting([{ id: "age", desc: true }]);
    expect(table.store.state.sorting).toEqual([{ id: "age", desc: true }]);
    expect(table.getRowModel().rows.map((row) => row.original.name)).toEqual([
      "omar",
      "ada",
      "salama",
      "lin",
      "zed",
    ]);
  });
});

describe("filtering", () => {
  test("a column filter narrows the rows and clears", () => {
    const view = grid();
    type(field(view, "filter-team"), "docs");
    expect(names(view)).toEqual(["ada", "lin"]);
    expect(table.store.state.columnFilters).toEqual([{ id: "team", value: "docs" }]);

    type(field(view, "filter-name"), "li");
    expect(names(view)).toEqual(["lin"]);

    type(field(view, "filter-team"), "");
    type(field(view, "filter-name"), "");
    expect(names(view)).toHaveLength(people.length);
  });

  test("the global filter matches across columns", () => {
    const view = grid();
    type(field(view, "global"), "infra");
    expect(names(view)).toEqual(["omar"]);

    type(field(view, "global"), "a");
    expect(names(view)).toEqual(["salama", "ada", "omar"]);

    type(field(view, "filter-team"), "core");
    expect(names(view)).toEqual(["salama"]);
  });
});

describe("pagination", () => {
  test("page index and page size move the window", () => {
    const view = grid({ initialState: { pagination: { pageIndex: 0, pageSize: 2 } } });
    expect(names(view)).toEqual(["salama", "ada"]);
    expect(testid(view, "page").textContent).toBe("1/3 size 2 rows 5");
    expect(button(view, "previous").disabled).toBe(true);

    click(testid(view, "next"));
    expect(names(view)).toEqual(["zed", "lin"]);
    click(testid(view, "next"));
    expect(names(view)).toEqual(["omar"]);
    expect(testid(view, "page").textContent).toBe("3/3 size 2 rows 5");
    expect(button(view, "next").disabled).toBe(true);

    click(testid(view, "previous"));
    expect(names(view)).toEqual(["zed", "lin"]);

    run(() => table.setPageSize(3));
    expect(testid(view, "page").textContent).toBe("1/2 size 3 rows 5");
    expect(names(view)).toEqual(["salama", "ada", "zed"]);

    run(() => table.setPageIndex(1));
    expect(names(view)).toEqual(["lin", "omar"]);
  });

  test("a filter that shrinks the result returns to the first page", async () => {
    const view = grid({ initialState: { pagination: { pageIndex: 2, pageSize: 2 } } });
    expect(names(view)).toEqual(["omar"]);

    type(field(view, "filter-team"), "core");
    // The reset is scheduled by table-core on a microtask.
    await Promise.resolve();
    flush();
    expect(table.store.state.pagination.pageIndex).toBe(0);
    expect(names(view)).toEqual(["salama", "zed"]);
  });
});

describe("row selection", () => {
  test("one row, then every row through the header checkbox", () => {
    const view = grid();
    click(testid(view, "select-2"));
    expect(testid(view, "selected").textContent).toBe("2");
    expect(view.one('tr[data-id="2"]').getAttribute("data-selected")).toBe("true");
    expect(view.one('tr[data-id="1"]').getAttribute("data-selected")).toBe("false");
    expect(field(view, "all").checked).toBe(false);
    expect(table.getIsSomeRowsSelected()).toBe(true);

    click(testid(view, "all"));
    expect(testid(view, "selected").textContent).toBe("1,2,3,4,5");
    expect(view.host.querySelectorAll('tr[data-selected="true"]')).toHaveLength(5);
    expect(field(view, "all").checked).toBe(true);
    expect(table.getSelectedRowModel().rows).toHaveLength(5);

    click(testid(view, "all"));
    expect(testid(view, "selected").textContent).toBe("");
    expect(view.host.querySelectorAll('tr[data-selected="true"]')).toHaveLength(0);
  });

  test("toggle all selects the filtered range only", () => {
    const view = grid();
    type(field(view, "filter-team"), "core");
    click(testid(view, "all"));
    expect(testid(view, "selected").textContent).toBe("1,3");

    type(field(view, "filter-team"), "");
    expect(view.text('tr[data-selected="true"] td[data-col="name"]')).toEqual(["salama", "zed"]);
    expect(field(view, "all").checked).toBe(false);
  });

  test("single selection replaces the selected row", () => {
    const view = grid({ enableMultiRowSelection: false });
    click(testid(view, "select-1"));
    click(testid(view, "select-4"));
    expect(testid(view, "selected").textContent).toBe("4");
  });
});

describe("column state", () => {
  const headers = (view: Mounted): string[] =>
    [...view.host.querySelectorAll("thead th[data-col]")].map(
      (node) => node.getAttribute("data-col") ?? "",
    );
  const firstRow = (view: Mounted): string[] => view.text("tbody tr:first-child td[data-col]");

  test("visibility hides the header and every cell of the column", () => {
    const view = grid();
    run(() => table.getColumn("age")!.toggleVisibility(false));
    expect(headers(view)).toEqual(["name", "team"]);
    expect(firstRow(view)).toEqual(["salama", "team:core"]);
    expect(table.store.state.columnVisibility).toEqual({ age: false });

    run(() => table.getColumn("age")!.toggleVisibility(true));
    expect(headers(view)).toEqual(["name", "age", "team"]);
    expect(firstRow(view)).toEqual(["salama", "30", "team:core"]);
  });

  test("ordering moves headers and cells together", () => {
    const view = grid();
    run(() => table.setColumnOrder(["team", "name", "age"]));
    expect(headers(view)).toEqual(["team", "name", "age"]);
    expect(firstRow(view)).toEqual(["team:core", "salama", "30"]);
  });

  test("pinning moves a column to its side and reports it", () => {
    const view = grid();
    run(() => table.getColumn("team")!.pin("start"));
    expect(headers(view)).toEqual(["team", "name", "age"]);
    expect(view.one('th[data-col="team"]').getAttribute("data-pinned")).toBe("start");
    expect(view.one('th[data-col="name"]').getAttribute("data-pinned")).toBe("false");
    expect(table.store.state.columnPinning).toEqual({ start: ["team"], end: [] });
    expect(
      table
        .getRowModel()
        .rows[0].getStartVisibleCells()
        .map((cell) => cell.column.id),
    ).toEqual(["team"]);

    run(() => table.getColumn("name")!.pin("end"));
    expect(headers(view)).toEqual(["team", "age", "name"]);

    run(() => table.getColumn("team")!.pin(false));
    expect(headers(view)).toEqual(["age", "team", "name"]);
  });

  test("sizing reaches the header size and the start of the next column", () => {
    const view = grid();
    expect(view.one('th[data-col="name"]').getAttribute("data-size")).toBe("150");
    expect(view.one('th[data-col="age"]').getAttribute("data-start")).toBe("150");

    run(() => table.setColumnSizing({ name: 240 }));
    expect(view.one('th[data-col="name"]').getAttribute("data-size")).toBe("240");
    expect(view.one('th[data-col="age"]').getAttribute("data-start")).toBe("240");
    expect(view.one('th[data-col="team"]').getAttribute("data-start")).toBe("390");
    expect(table.getTotalSize()).toBe(540);
  });
});

describe("expanding", () => {
  const tree: Person[] = [
    {
      ...person(1, "salama", 30, "core"),
      reports: [person(11, "ada", 40, "core"), person(12, "zed", 20, "core")],
    },
    person(2, "lin", 30, "docs"),
  ];
  const options: Partial<TableOptions<Features, Person>> = {
    data: tree,
    getSubRows: (row) => row.reports,
  };

  test("a parent row reveals and hides its sub rows", () => {
    const view = grid(options);
    expect(names(view)).toEqual(["salama", "lin"]);
    expect(view.host.querySelectorAll('[data-testid^="expand-"]')).toHaveLength(1);
    expect(testid(view, "expand-1").textContent).toBe("expand");

    click(testid(view, "expand-1"));
    expect(names(view)).toEqual(["salama", "ada", "zed", "lin"]);
    expect(view.one('tr[data-id="11"]').getAttribute("data-depth")).toBe("1");
    expect(testid(view, "expand-1").textContent).toBe("collapse");
    expect(table.store.state.expanded).toEqual({ "1": true });

    click(testid(view, "expand-1"));
    expect(names(view)).toEqual(["salama", "lin"]);
  });

  test("toggleAllRowsExpanded opens the whole tree", () => {
    const view = grid(options);
    run(() => table.toggleAllRowsExpanded(true));
    expect(names(view)).toEqual(["salama", "ada", "zed", "lin"]);
    expect(table.getIsAllRowsExpanded()).toBe(true);
  });
});

describe("grouping and aggregation", () => {
  test("group rows aggregate, and their leaves show under them", () => {
    const view = grid();
    run(() => table.setGrouping(["team"]));

    expect(view.host.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(view.text('tbody td[data-col="team"]')).toEqual([
      "team:core",
      "team:docs",
      "team:infra",
    ]);
    expect(view.text('tbody td[data-col="age"]')).toEqual(["sum:50", "sum:70", "sum:50"]);
    expect(view.one('tbody tr:first-child td[data-col="team"]').getAttribute("data-grouped")).toBe(
      "true",
    );
    expect(table.getRowModel().rows[0].subRows).toHaveLength(2);

    click(testid(view, "expand-team:core"));
    expect(view.host.querySelectorAll("tbody tr")).toHaveLength(5);
    // A leaf under a group repeats the group's value, which is a placeholder.
    expect(view.text('tbody tr[data-depth="1"] td[data-col="team"]')).toEqual(["", ""]);
    expect(view.text('tbody tr[data-depth="1"] td[data-col="age"]')).toEqual(["30", "20"]);
    expect(view.text('tbody tr[data-depth="1"] td[data-col="name"]')).toEqual(["salama", "zed"]);
  });

  test("ungrouping restores the flat rows and their cell templates", () => {
    const view = grid();
    run(() => table.getColumn("team")!.toggleGrouping());
    expect(view.host.querySelectorAll("tbody tr")).toHaveLength(3);
    run(() => table.getColumn("team")!.toggleGrouping());
    expect(names(view)).toEqual(["salama", "ada", "zed", "lin", "omar"]);
    expect(view.text('tbody td[data-col="age"]')).toEqual(["30", "40", "20", "30", "50"]);
    expect(view.text('tbody td[data-col="team"]')[0]).toBe("team:core");
  });
});

describe("faceting", () => {
  function Facets() {
    table = createTable({ features, columns, data: people, getRowId: (row) => row.id });
    const team = table.getColumn("team")!;
    const age = table.getColumn("age")!;
    return (
      <div>
        <ul>
          <For
            each={() => [...team.getFacetedUniqueValues().entries()]}
            keyed={(entry: [string, number]) => entry[0]}
          >
            {(entry: () => [string, number]) => (
              <li>
                {entry()[0]}:{entry()[1]}
              </li>
            )}
          </For>
        </ul>
        <output>{(age.getFacetedMinMaxValues() ?? []).join("-")}</output>
      </div>
    );
  }

  test("unique values and the range follow the other columns' filters", () => {
    const view = mount(() => <Facets />);
    expect(view.text("li")).toEqual(["core:2", "docs:2", "infra:1"]);
    expect(view.one("output").textContent).toBe("20-50");

    run(() => table.getColumn("name")!.setFilterValue("a"));
    expect(view.text("li")).toEqual(["core:1", "docs:1", "infra:1"]);
    expect(view.one("output").textContent).toBe("30-50");

    // A column's own filter does not narrow its own facets.
    run(() => table.getColumn("team")!.setFilterValue("docs"));
    expect(view.text("li")).toEqual(["core:1", "docs:1", "infra:1"]);
    expect(view.one("output").textContent).toBe("40-40");
  });
});
