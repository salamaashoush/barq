import { afterEach, describe, expect, test } from "bun:test";
import { For, createSignal, flush } from "@barqjs/core";

import {
  type Features,
  type Person,
  click,
  features,
  mount,
  people,
  unmountAll,
} from "./fixtures.ts";
import {
  type Cell,
  type Header,
  type HeaderGroup,
  type Row,
  type SortingState,
  createTableHook,
} from "./index.ts";

afterEach(unmountAll);

function RowCount() {
  const table = useTableContext<Person>();
  return <output data-testid="count">{table.getRowModel().rows.length}</output>;
}

function Shout(props: { mark?: () => string }) {
  const cell = useCellContext<string>();
  return <strong>{cell.getValue().toUpperCase() + (props.mark?.() ?? "")}</strong>;
}

function SortButton() {
  const header = useHeaderContext();
  return (
    <button
      type="button"
      data-testid={`sort-${header.column.id}`}
      onClick={header.column.getToggleSortingHandler()}
    >
      {`${header.column.id}:${header.column.getIsSorted()}`}
    </button>
  );
}

const {
  appFeatures,
  createAppColumnHelper,
  createAppTable,
  useCellContext,
  useHeaderContext,
  useTableContext,
} = createTableHook({
  features,
  getRowId: (row: Person) => row.id,
  tableComponents: { RowCount },
  cellComponents: { Shout },
  headerComponents: { SortButton },
});

const helper = createAppColumnHelper<Person>();
const columns = helper.columns([
  helper.accessor("name", {
    header: ({ header }) => <header.SortButton />,
    cell: ({ cell }) => <cell.Shout mark="!" />,
    footer: ({ column }) => `footer:${column.id}`,
  }),
  helper.accessor((row) => row.age * 2, { id: "double", header: "Double", footer: "twice" }),
  helper.display({ id: "team", cell: ({ row }) => row.original.team }),
]);

function App(props: { rows?: () => Person[] }) {
  const table = createAppTable<Person>(() => ({ columns, data: props.rows?.() ?? people }));
  return (
    <table.AppTable>
      <table.RowCount />
      <table>
        <thead>
          <For each={table.getHeaderGroups()}>
            {(group: HeaderGroup<Features, Person>) => (
              <tr>
                <For each={group.headers}>
                  {(header: Header<Features, Person>) => (
                    <table.AppHeader header={header}>
                      {(extended) => (
                        <th>
                          <extended.FlexRender />
                        </th>
                      )}
                    </table.AppHeader>
                  )}
                </For>
              </tr>
            )}
          </For>
        </thead>
        <tbody>
          <For each={table.getRowModel().rows}>
            {(row: Row<Features, Person>) => (
              <tr data-id={row.id}>
                <For each={row.getAllCells()}>
                  {(cell: Cell<Features, Person>) => (
                    <table.AppCell cell={cell}>
                      {(extended) => (
                        <td data-has={typeof extended.Shout}>
                          <extended.FlexRender />
                        </td>
                      )}
                    </table.AppCell>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
        <tfoot>
          <For each={table.getFooterGroups()}>
            {(group: HeaderGroup<Features, Person>) => (
              <tr>
                <For each={group.headers}>
                  {(footer: Header<Features, Person>) => (
                    <table.AppFooter header={footer}>
                      {(extended) => (
                        <td>
                          <extended.FlexRender />
                        </td>
                      )}
                    </table.AppFooter>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tfoot>
      </table>
    </table.AppTable>
  );
}

describe("createTableHook", () => {
  test("the bound features and default options reach every table it makes", () => {
    expect(appFeatures).toBe(features);
    const view = mount(() => <App />);
    expect(
      [...view.host.querySelectorAll("tbody tr")].map((row) => row.getAttribute("data-id")),
    ).toEqual(["1", "2", "3", "4", "5"]);
  });

  test("registered components read their table, cell and header from context", () => {
    const view = mount(() => <App />);
    expect(view.one('[data-testid="count"]').textContent).toBe("5");
    expect(view.text("tbody tr:first-child td")).toEqual(["SALAMA!", "60", "core"]);
    expect(view.one("tbody td").getAttribute("data-has")).toBe("function");
    expect(view.text("thead th")).toEqual(["name:false", "Double", ""]);
    expect(view.text("tfoot td")).toEqual(["footer:name", "twice", ""]);

    click(view.one('[data-testid="sort-name"]'));
    expect(view.one('[data-testid="sort-name"]').textContent).toBe("name:asc");
    expect(view.text("tbody td:first-child")).toEqual(["ADA!", "LIN!", "OMAR!", "SALAMA!", "ZED!"]);
  });

  test("options passed as an accessor stay reactive through the hook", () => {
    const [rows, setRows] = createSignal(people.slice(0, 2));
    const view = mount(() => <App rows={rows()} />);
    expect(view.one('[data-testid="count"]').textContent).toBe("2");
    setRows(people);
    flush();
    expect(view.one('[data-testid="count"]').textContent).toBe("5");
  });

  test("an options object takes controlled state through getters", () => {
    const [sorting, setSorting] = createSignal<SortingState>([]);
    const view = mount(() => {
      const table = createAppTable<Person>({
        columns,
        data: people,
        state: {
          get sorting() {
            return sorting();
          },
        },
        onSortingChange: setSorting,
      });
      return (
        <ul>
          <For each={table.getRowModel().rows}>
            {(row: Row<Features, Person>) => <li>{row.original.name}</li>}
          </For>
        </ul>
      );
    });
    setSorting([{ id: "double", desc: true }]);
    flush();
    expect(view.text("li")).toEqual(["omar", "ada", "salama", "lin", "zed"]);
  });

  test("a context reader outside its provider says which provider is missing", () => {
    const failure = (read: () => unknown): string => {
      let message = "";
      mount(() => {
        try {
          read();
        } catch (error) {
          message = (error as Error).message;
        }
        return null;
      });
      return message;
    };
    expect(failure(useTableContext)).toContain(
      "`useTableContext` must be used within an `AppTable`",
    );
    expect(failure(useCellContext)).toContain("`useCellContext` must be used within an `AppCell`");
    expect(failure(useHeaderContext)).toContain(
      "`useHeaderContext` must be used within an `AppHeader` or `AppFooter`",
    );
  });
});
