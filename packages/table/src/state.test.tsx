import { afterEach, describe, expect, test } from "bun:test";
import { For, createRenderEffect, createRoot, createSignal, flush } from "@barqjs/core";
import { createAtom } from "@tanstack/store";

import {
  type Features,
  type Mounted,
  type Person,
  click,
  features,
  mount,
  people,
  person,
  unmountAll,
} from "./fixtures.ts";
import {
  type BarqTable,
  type Cell,
  type ColumnDef,
  type PaginationState,
  type Row,
  type RowSelectionState,
  type SortFn,
  type SortingState,
  FlexRender,
  createTable,
  sortFn_alphanumeric,
  sortFn_basic,
} from "./index.ts";

afterEach(unmountAll);

const columns: Array<ColumnDef<Features, Person>> = [
  { accessorKey: "name" },
  { accessorKey: "age" },
  { accessorKey: "team" },
];

const names = (view: Mounted): string[] => view.text("li .name");

function Rows(props: { table: () => BarqTable<Features, Person> }) {
  const table = props.table();
  return (
    <ul>
      <For each={table.getRowModel().rows}>
        {(row: Row<Features, Person>) => (
          <li data-id={row.id} data-selected={`${row.getIsSelected()}`}>
            <span class="name">{row.original.name}</span>
            <span class="age">{row.original.age}</span>
          </li>
        )}
      </For>
    </ul>
  );
}

describe("controlled state", () => {
  test("a barq signal owns sorting: the table asks, the signal answers", () => {
    const [sorting, setSorting] = createSignal<SortingState>([]);
    const asked: SortingState[] = [];
    let table!: BarqTable<Features, Person>;

    function Controlled() {
      table = createTable(() => ({
        features,
        columns,
        data: people,
        getRowId: (row: Person) => row.id,
        state: { sorting: sorting() },
        onSortingChange: (updater) => {
          const next = typeof updater === "function" ? updater(sorting()) : updater;
          asked.push(next);
          setSorting(next);
        },
      }));
      return (
        <div>
          <button type="button" onClick={() => table.getColumn("age")!.toggleSorting(false)}>
            sort
          </button>
          <Rows table={table} />
          <output>{JSON.stringify(sorting())}</output>
        </div>
      );
    }

    const view = mount(() => <Controlled />);
    click(view.one("button"));
    expect(asked).toEqual([[{ id: "age", desc: false }]]);
    expect(view.one("output").textContent).toBe('[{"id":"age","desc":false}]');
    expect(names(view)).toEqual(["zed", "salama", "lin", "ada", "omar"]);
    expect(table.atoms.sorting.get()).toEqual([{ id: "age", desc: false }]);

    setSorting([{ id: "name", desc: true }]);
    flush();
    expect(names(view)).toEqual(["zed", "salama", "omar", "lin", "ada"]);
  });

  test("a handler that ignores the request leaves the table where it was", () => {
    let table!: BarqTable<Features, Person>;
    const view = mount(() => {
      table = createTable(() => ({
        features,
        columns,
        data: people,
        state: { sorting: [] },
        onSortingChange: () => {},
      }));
      return <Rows table={table} />;
    });

    table.setSorting([{ id: "age", desc: true }]);
    flush();
    expect(table.atoms.sorting.get()).toEqual([]);
    expect(names(view)).toEqual(["salama", "ada", "zed", "lin", "omar"]);
  });

  test("controlled pagination is driven from outside and from the table", () => {
    const [pagination, setPagination] = createSignal<PaginationState>({
      pageIndex: 0,
      pageSize: 2,
    });
    let table!: BarqTable<Features, Person>;
    const view = mount(() => {
      table = createTable(() => ({
        features,
        columns,
        data: people,
        state: { pagination: pagination() },
        onPaginationChange: setPagination,
      }));
      return <Rows table={table} />;
    });
    expect(names(view)).toEqual(["salama", "ada"]);

    setPagination({ pageIndex: 2, pageSize: 2 });
    flush();
    expect(names(view)).toEqual(["omar"]);

    table.previousPage();
    flush();
    expect(pagination()).toEqual({ pageIndex: 1, pageSize: 2 });
    expect(names(view)).toEqual(["zed", "lin"]);
  });

  test("getters on an options object are read live, as in the Solid adapter", () => {
    const [rows, setRows] = createSignal(people.slice(0, 2));
    const [sorting, setSorting] = createSignal<SortingState>([]);
    const view = mount(() => {
      const table = createTable({
        features,
        columns,
        get data() {
          return rows();
        },
        state: {
          get sorting() {
            return sorting();
          },
        },
        onSortingChange: setSorting,
      });
      return <Rows table={table} />;
    });
    expect(names(view)).toEqual(["salama", "ada"]);

    setRows(people.slice(0, 3));
    flush();
    expect(names(view)).toEqual(["salama", "ada", "zed"]);

    setSorting([{ id: "name", desc: false }]);
    flush();
    expect(names(view)).toEqual(["ada", "salama", "zed"]);
  });
});

describe("uncontrolled state", () => {
  test("initial state applies, the table owns what follows, and reset returns to it", () => {
    let table!: BarqTable<Features, Person>;
    const view = mount(() => {
      table = createTable({
        features,
        columns,
        data: people,
        initialState: { sorting: [{ id: "age", desc: true }] },
      });
      return <Rows table={table} />;
    });
    expect(names(view)).toEqual(["omar", "ada", "salama", "lin", "zed"]);

    table.setSorting([{ id: "name", desc: false }]);
    flush();
    expect(names(view)).toEqual(["ada", "lin", "omar", "salama", "zed"]);

    table.resetSorting();
    flush();
    expect(names(view)).toEqual(["omar", "ada", "salama", "lin", "zed"]);

    table.setGlobalFilter("docs");
    table.reset();
    flush();
    expect(table.atoms.globalFilter.get()).toBeUndefined();
    expect(names(view)).toEqual(["omar", "ada", "salama", "lin", "zed"]);
  });

  test("a write is readable before any flush", () => {
    createRoot((dispose) => {
      const table = createTable({ features, columns, data: people });
      table.setPageSize(2);
      expect(table.atoms.pagination.get().pageSize).toBe(2);
      expect(table.getPageCount()).toBe(3);
      table.setPageIndex(2);
      expect(table.getRowModel().rows.map((row) => row.original.name)).toEqual(["omar"]);
      table.setPageSize(4);
      // table-core keeps the first visible row on screen across a size change.
      expect(table.atoms.pagination.get()).toEqual({ pageIndex: 1, pageSize: 4 });
      dispose();
    });
  });
});

describe("reactive options", () => {
  test("new data, new columns and a changed flag all reach the table", () => {
    const [rows, setRows] = createSignal(people);
    const [shown, setShown] = createSignal(columns);
    const [sortable, setSortable] = createSignal(true);
    let table!: BarqTable<Features, Person>;

    function Options() {
      table = createTable(() => ({
        features,
        columns: shown(),
        data: rows(),
        enableSorting: sortable(),
        getRowId: (row: Person) => row.id,
      }));
      return (
        <div>
          <Rows table={table} />
          <output data-testid="columns">
            {table
              .getAllLeafColumns()
              .map((column) => column.id)
              .join(",")}
          </output>
          <output data-testid="sortable">{`${table.getColumn("name")?.getCanSort()}`}</output>
        </div>
      );
    }

    const view = mount(() => <Options />);
    expect(view.one('[data-testid="columns"]').textContent).toBe("name,age,team");
    expect(view.one('[data-testid="sortable"]').textContent).toBe("true");

    setRows([person(9, "noor", 33, "core"), ...people.slice(0, 1)]);
    flush();
    expect(names(view)).toEqual(["noor", "salama"]);

    setShown(columns.slice(0, 2));
    flush();
    expect(view.one('[data-testid="columns"]').textContent).toBe("name,age");

    setSortable(false);
    flush();
    expect(view.one('[data-testid="sortable"]').textContent).toBe("false");
    expect(table.options.enableSorting).toBe(false);
  });
});

describe("external atoms", () => {
  test("an atom passed in owns its slice in both directions", () => {
    const selection = createAtom<RowSelectionState>({});
    let table!: BarqTable<Features, Person>;
    const view = mount(() => {
      table = createTable({
        features,
        columns,
        data: people,
        getRowId: (row) => row.id,
        atoms: { rowSelection: selection },
      });
      return <Rows table={table} />;
    });

    selection.set({ "2": true });
    flush();
    expect(view.text('li[data-selected="true"] .name')).toEqual(["ada"]);

    table.getRow("3").toggleSelected(true);
    flush();
    expect(selection.get()).toEqual({ "2": true, "3": true });
    expect(view.text('li[data-selected="true"] .name')).toEqual(["ada", "zed"]);
  });
});

describe("granularity and lifetime", () => {
  test("a computation follows the slice it read and nothing else", () => {
    const runs = { sorting: 0, pagination: 0 };
    let table!: BarqTable<Features, Person>;
    const dispose = createRoot((disposeRoot) => {
      table = createTable({ features, columns, data: people });
      createRenderEffect(
        () => table.atoms.sorting.get(),
        () => {
          runs.sorting++;
        },
      );
      createRenderEffect(
        () => table.atoms.pagination.get(),
        () => {
          runs.pagination++;
        },
      );
      return disposeRoot;
    });
    flush();
    expect(runs).toEqual({ sorting: 1, pagination: 1 });

    table.setPageIndex(0);
    flush();
    expect(runs).toEqual({ sorting: 1, pagination: 1 });

    table.setPageSize(2);
    flush();
    expect(runs).toEqual({ sorting: 1, pagination: 2 });

    table.setSorting([{ id: "age", desc: false }]);
    flush();
    expect(runs).toEqual({ sorting: 2, pagination: 2 });

    dispose();
    table.setSorting([]);
    table.setPageSize(3);
    flush();
    expect(runs).toEqual({ sorting: 2, pagination: 2 });
  });

  test("disposing the owner releases an external atom", () => {
    const selection = createAtom<RowSelectionState>({});
    const watched = (): boolean => (selection as unknown as { subs?: object }).subs !== undefined;
    const dispose = createRoot((disposeRoot) => {
      createTable({ features, columns, data: people, atoms: { rowSelection: selection } });
      return disposeRoot;
    });
    expect(watched()).toBe(true);
    dispose();
    expect(watched()).toBe(false);
  });
});

describe("row identity", () => {
  function Body(props: { table: () => BarqTable<Features, Person> }) {
    const table = props.table();
    return (
      <table>
        <tbody>
          <For each={table.getRowModel().rows}>
            {(row: Row<Features, Person>) => (
              <tr data-id={row.id}>
                <For each={row.getVisibleCells()}>
                  {(cell: Cell<Features, Person>) => (
                    <td>
                      <FlexRender cell={cell} />
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    );
  }

  const rowNodes = (view: Mounted): Map<string, Element> =>
    new Map(
      [...view.host.querySelectorAll("tbody tr")].map((node) => [
        node.getAttribute("data-id")!,
        node,
      ]),
    );
  const order = (view: Mounted): string[] =>
    [...view.host.querySelectorAll("tbody tr")].map((node) => node.getAttribute("data-id")!);

  test("a sort moves the existing rows instead of building new ones", () => {
    let table!: BarqTable<Features, Person>;
    const view = mount(() => {
      table = createTable({ features, columns, data: people, getRowId: (row) => row.id });
      return <Body table={table} />;
    });
    const before = rowNodes(view);
    const cells = [...view.host.querySelectorAll("tbody td")];
    const rowModel = table.getRowModel();
    expect(table.getRowModel()).toBe(rowModel);

    table.setSorting([{ id: "age", desc: true }]);
    flush();
    expect(order(view)).toEqual(["5", "2", "1", "4", "3"]);
    const after = rowNodes(view);
    for (const [id, node] of before) expect(after.get(id)).toBe(node);
    expect(new Set(view.host.querySelectorAll("tbody td"))).toEqual(new Set(cells));

    table.setSorting([]);
    flush();
    expect(order(view)).toEqual(["1", "2", "3", "4", "5"]);
    for (const [id, node] of before) expect(rowNodes(view).get(id)).toBe(node);
  });

  test("selection, filtering and paging keep the rows that stay", () => {
    let table!: BarqTable<Features, Person>;
    const view = mount(() => {
      table = createTable({ features, columns, data: people, getRowId: (row) => row.id });
      return <Body table={table} />;
    });
    const before = rowNodes(view);

    table.toggleAllRowsSelected(true);
    flush();
    for (const [id, node] of before) expect(rowNodes(view).get(id)).toBe(node);

    table.getColumn("team")!.setFilterValue("core");
    flush();
    expect(order(view)).toEqual(["1", "3"]);
    expect(rowNodes(view).get("1")).toBe(before.get("1"));
    expect(rowNodes(view).get("3")).toBe(before.get("3"));

    table.getColumn("team")!.setFilterValue(undefined);
    table.setPageSize(2);
    flush();
    expect(order(view)).toEqual(["1", "2"]);
    expect(rowNodes(view).get("1")).toBe(before.get("1"));
  });

  test("keyed by row id, the rows survive new data and show its values", () => {
    const [rows, setRows] = createSignal(people.slice(0, 3));
    const view = mount(() => {
      const table = createTable(() => ({
        features,
        columns,
        data: rows(),
        getRowId: (row: Person) => row.id,
      }));
      return (
        <ul>
          <For each={table.getRowModel().rows} keyed={(row: Row<Features, Person>) => row.id}>
            {(row: () => Row<Features, Person>) => (
              <li data-id={row().id}>{`${row().original.name}:${row().original.age}`}</li>
            )}
          </For>
        </ul>
      );
    });
    const before = [...view.host.querySelectorAll("li")];
    expect(view.text("li")).toEqual(["salama:30", "ada:40", "zed:20"]);

    setRows([
      person(1, "salama", 31, "core"),
      person(2, "ada", 40, "docs"),
      person(3, "zed", 20, "core"),
    ]);
    flush();
    expect(view.text("li")).toEqual(["salama:31", "ada:40", "zed:20"]);
    expect([...view.host.querySelectorAll("li")]).toEqual(before);
    for (const [index, node] of before.entries()) {
      expect(view.host.querySelectorAll("li")[index]).toBe(node);
    }
  });
});

describe("scale", () => {
  test("ten thousand rows sort in n log n comparisons and render one page", () => {
    const teams = ["core", "docs", "infra", "web"];
    const rows = 10_000;
    const many = Array.from({ length: rows }, (_, index) =>
      person(index, `user${index}`, (index * 7919) % 1000, teams[index % teams.length]),
    );
    // The two functions `auto` resolves these columns to, counted.
    let comparisons = 0;
    const counted =
      (sort: SortFn<Features, Person>): SortFn<Features, Person> =>
      (a, b, id) => {
        comparisons++;
        return sort(a, b, id);
      };
    const countedColumns: Array<ColumnDef<Features, Person>> = [
      { accessorKey: "name", sortFn: counted(sortFn_alphanumeric) },
      { accessorKey: "age", sortFn: counted(sortFn_basic) },
      { accessorKey: "team" },
    ];
    const bound = rows * Math.ceil(Math.log2(rows));
    let table!: BarqTable<Features, Person>;
    const view = mount(() => {
      table = createTable({
        features,
        columns: countedColumns,
        data: many,
        getRowId: (row) => row.id,
        initialState: { pagination: { pageIndex: 0, pageSize: 50 } },
      });
      return <Rows table={table} />;
    });
    expect(view.host.querySelectorAll("li")).toHaveLength(50);

    table.setSorting([{ id: "age", desc: true }]);
    flush();
    const byAge = comparisons;
    comparisons = 0;
    table.setSorting([{ id: "name", desc: false }]);
    flush();
    const byName = comparisons;

    expect(view.host.querySelectorAll("li")).toHaveLength(50);
    expect(view.text("li .name").slice(0, 3)).toEqual(["user0", "user1", "user2"]);
    expect(byAge, "the age sort compared rows").toBeGreaterThanOrEqual(rows - 1);
    expect(byAge).toBeLessThanOrEqual(bound);
    expect(byName, "the name sort compared rows").toBeGreaterThanOrEqual(rows - 1);
    expect(byName).toBeLessThanOrEqual(bound);

    table.setSorting([{ id: "age", desc: true }]);
    flush();
    expect(view.text("li .age")[0]).toBe("999");
    expect(table.getRowCount()).toBe(10_000);
  });
});
