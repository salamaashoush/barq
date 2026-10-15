import { afterEach, describe, expect, test } from "bun:test";
import { For, createSignal, flush } from "@barqjs/core";

import { type Features, type Person, features, mount, people, unmountAll } from "./fixtures.ts";
import {
  type Cell,
  type ColumnDef,
  type Header,
  type HeaderGroup,
  type Row,
  FlexRender,
  createTable,
  flexRender,
} from "./index.ts";

afterEach(unmountAll);

function Badge(props: { value: () => number; tone?: () => string }) {
  return (
    <b class="badge" data-tone={props.tone?.() ?? "plain"}>
      {props.value()}
    </b>
  );
}

const columns: Array<ColumnDef<Features, Person>> = [
  {
    accessorKey: "name",
    header: "Name",
    cell: (context) => `cell:${context.getValue<string>()}`,
    footer: (context) => `footer:${context.column.id}`,
  },
  {
    accessorKey: "age",
    header: () => <i>Age</i>,
    cell: (context) => <Badge value={context.getValue<number>()} tone="warm" />,
    footer: "years",
  },
  { accessorKey: "team" },
];

function Markup() {
  const table = createTable({ features, columns, data: people, getRowId: (row) => row.id });
  return (
    <table>
      <thead>
        <For each={table.getHeaderGroups()}>
          {(group: HeaderGroup<Features, Person>) => (
            <tr>
              <For each={group.headers}>
                {(header: Header<Features, Person>) => (
                  <th>
                    <FlexRender header={header} />
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
            <tr>
              <For each={row.getAllCells()}>
                {(cell: Cell<Features, Person>) => (
                  <td>
                    <table.FlexRender cell={cell} />
                  </td>
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
                  <td>
                    <FlexRender footer={footer} />
                  </td>
                )}
              </For>
            </tr>
          )}
        </For>
      </tfoot>
    </table>
  );
}

function FunctionForm() {
  const table = createTable({ features, columns, data: people, getRowId: (row) => row.id });
  return (
    <ul>
      <For each={table.getRowModel().rows}>
        {(row: Row<Features, Person>) => (
          <li>
            <For each={row.getAllCells()}>
              {(cell: Cell<Features, Person>) => (
                <span>{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
              )}
            </For>
          </li>
        )}
      </For>
    </ul>
  );
}

describe("column templates", () => {
  test("string, function and component templates render in header, cell and footer", () => {
    const view = mount(() => <Markup />);

    expect(view.text("thead th")).toEqual(["Name", "Age", "team"]);
    expect(view.one("thead th:nth-child(2) i").textContent).toBe("Age");

    expect(view.text("tbody tr:first-child td")).toEqual(["cell:salama", "30", "core"]);
    const badge = view.one("tbody tr:first-child td:nth-child(2) b.badge");
    expect(badge.getAttribute("data-tone")).toBe("warm");

    expect(view.text("tfoot td")).toEqual(["footer:name", "years", ""]);
  });

  test("flexRender is the function form of the same thing", () => {
    const view = mount(() => <FunctionForm />);
    expect(view.text("li:first-child span")).toEqual(["cell:salama", "30", "core"]);
    expect(view.host.querySelectorAll("li b.badge")).toHaveLength(people.length);
  });

  test("flexRender passes values through and calls functions with the context", () => {
    expect(flexRender(undefined, {})).toBeNull();
    expect(flexRender(null, {})).toBeNull();
    expect(flexRender("plain", {})).toBe("plain");
    expect(flexRender(7, {})).toBe(7);
    expect(flexRender((context: { id: string }) => `id:${context.id}`, { id: "a" })).toBe("id:a");
  });

  test("table.FlexRender is FlexRender", () => {
    let same = false;
    mount(() => {
      const table = createTable({ features, columns, data: people });
      same = table.FlexRender === FlexRender;
      return null;
    });
    expect(same).toBe(true);
  });
});

describe("what a template tracks", () => {
  test("the body runs once; a function it returns stays live", () => {
    const [suffix, setSuffix] = createSignal("!");
    let builds = 0;
    const live: Array<ColumnDef<Features, Person>> = [
      {
        accessorKey: "name",
        cell: (context) => {
          builds++;
          const name = context.getValue<string>();
          return () => name + suffix();
        },
      },
    ];

    function Live() {
      const table = createTable({ features, columns: live, data: people.slice(0, 2) });
      return (
        <ul>
          <For each={table.getRowModel().rows}>
            {(row: Row<Features, Person>) => (
              <li>
                <FlexRender cell={row.getAllCells()[0]} />
              </li>
            )}
          </For>
        </ul>
      );
    }

    const view = mount(() => <Live />);
    expect(view.text("li")).toEqual(["salama!", "ada!"]);
    expect(builds).toBe(2);

    const first = view.one("li");
    setSuffix("?");
    flush();
    expect(view.text("li")).toEqual(["salama?", "ada?"]);
    expect(builds).toBe(2);
    expect(view.one("li")).toBe(first);
  });

  test("a new cell in the same position renders that cell", () => {
    const [index, setIndex] = createSignal(0);

    function Swap() {
      const table = createTable({ features, columns, data: people });
      return (
        <p>
          <FlexRender cell={table.getRowModel().rows[index()].getAllCells()[0]} />
        </p>
      );
    }

    const view = mount(() => <Swap />);
    expect(view.one("p").textContent).toBe("cell:salama");
    setIndex(2);
    flush();
    expect(view.one("p").textContent).toBe("cell:zed");
  });
});
