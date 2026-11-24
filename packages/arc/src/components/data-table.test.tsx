import { describe, expect, test } from "bun:test";
import { type Child, DEV, createSignal, flush } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import type { ColumnVisibilityState, SortingState } from "@barqjs/table";
import { ariaViolations, render, screen, tick, user, waitFor, within } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";

import { hydrates } from "../test-arc.ts";
import { ConfirmHost } from "./confirm.tsx";
import { type DataTableColumn, DataTable } from "./data-table.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

interface Invoice {
  id: string;
  number: string;
  customer: string;
  total: number;
}

const INVOICES: Invoice[] = [
  { id: "a", number: "INV-001", customer: "Acme", total: 120 },
  { id: "b", number: "INV-002", customer: "Globex", total: 80 },
  { id: "c", number: "INV-003", customer: "Initech", total: 300 },
];

const COLUMNS: DataTableColumn<Invoice>[] = [
  { accessorKey: "number", header: "Number" },
  { accessorKey: "customer", header: "Customer" },
  { accessorKey: "total", header: "Total", align: "end" },
];

const bodyRows = (): HTMLElement[] =>
  screen.getAllByRole("row").filter((row) => row.getAttribute("data-slot") === "data-table-row");

const texts = (): string[] =>
  bodyRows().map((row) => row.querySelector('[role="rowheader"]')?.textContent ?? "");

describe("DataTable", () => {
  test("is a grid named by its label, with a header row and a row per record", async () => {
    render(() => (
      <DataTable label="Invoices" columns={COLUMNS} data={INVOICES} getRowId={(i) => i.id} />
    ));
    await settle();
    const grid = screen.getByRole("grid", { name: "Invoices" });
    expect(grid.getAttribute("data-slot")).toBe("data-table-grid");
    expect(screen.getAllByRole("columnheader").map((head) => head.textContent)).toEqual([
      "Number",
      "Customer",
      "Total",
    ]);
    expect(texts()).toEqual(["INV-001", "INV-002", "INV-003"]);
    expect(screen.getAllByRole("rowheader")).toHaveLength(3);
    expect(await ariaViolations(document.body)).toEqual([]);
  });
});

function viewport(width: number): void {
  (
    window as unknown as { happyDOM: { setViewport(size: { width: number }): void } }
  ).happyDOM.setViewport({
    width,
  });
}

describe("DataTable sorting", () => {
  test("pressing a sortable header orders the rows, and again reverses them", async () => {
    render(() => (
      <DataTable label="Invoices" columns={COLUMNS} data={INVOICES} getRowId={(i) => i.id} />
    ));
    await settle();
    const total = screen.getByRole("columnheader", { name: "Total" });
    await user.click(total);
    await settle();
    expect(total.getAttribute("aria-sort")).toBe("ascending");
    expect(texts()).toEqual(["INV-002", "INV-001", "INV-003"]);

    await user.click(total);
    await settle();
    expect(total.getAttribute("aria-sort")).toBe("descending");
    expect(texts()).toEqual(["INV-003", "INV-001", "INV-002"]);
    expect(screen.getByRole("columnheader", { name: "Number" }).hasAttribute("aria-sort")).toBe(
      false,
    );
  });

  test("from the keyboard: the arrows reach a header and Enter sorts by it", async () => {
    render(() => (
      <DataTable label="Invoices" columns={COLUMNS} data={INVOICES} getRowId={(i) => i.id} />
    ));
    await settle();
    user.tab();
    await settle();
    const first = document.activeElement as HTMLElement;
    expect(first.getAttribute("role")).toBe("rowheader");
    expect(first.textContent).toBe("INV-001");

    await user.keyboard("{ArrowRight}");
    await settle();
    expect(document.activeElement?.textContent).toBe("Acme");
    await user.keyboard("{ArrowDown}");
    await settle();
    expect(document.activeElement?.textContent).toBe("Globex");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    await settle();
    const header = document.activeElement as HTMLElement;
    expect(header.getAttribute("role")).toBe("columnheader");
    expect(header.textContent).toBe("Customer");

    await user.keyboard("{Enter}");
    await settle();
    expect(header.getAttribute("aria-sort")).toBe("ascending");
    expect(texts()).toEqual(["INV-001", "INV-002", "INV-003"]);
  });

  test("follows the caller's sorting and hands every change back", async () => {
    const [sorting, setSorting] = createSignal<SortingState>([{ id: "customer", desc: true }]);
    const seen: SortingState[] = [];
    render(() => (
      <DataTable
        label="Invoices"
        columns={COLUMNS}
        data={INVOICES}
        getRowId={(i) => i.id}
        sorting={sorting()}
        onSortingChange={(next) => {
          seen.push(next);
          setSorting(next);
        }}
      />
    ));
    await settle();
    expect(texts()).toEqual(["INV-003", "INV-002", "INV-001"]);
    await user.click(screen.getByRole("columnheader", { name: "Number" }));
    await settle();
    expect(seen).toEqual([[{ id: "number", desc: false }]]);
    expect(texts()).toEqual(["INV-001", "INV-002", "INV-003"]);
  });

  test("a server's order is left alone with manualSorting", async () => {
    const seen: SortingState[] = [];
    render(() => (
      <DataTable
        label="Invoices"
        columns={COLUMNS}
        data={INVOICES}
        getRowId={(i) => i.id}
        manualSorting
        onSortingChange={(next) => seen.push(next)}
      />
    ));
    await settle();
    await user.click(screen.getByRole("columnheader", { name: "Total" }));
    await settle();
    expect(seen).toEqual([[{ id: "total", desc: false }]]);
    expect(texts()).toEqual(["INV-001", "INV-002", "INV-003"]);
  });

  test("a column that cannot sort says nothing about order", async () => {
    render(() => (
      <DataTable
        label="Invoices"
        columns={[
          { accessorKey: "number", header: "Number", enableSorting: false },
          ...COLUMNS.slice(1),
        ]}
        data={INVOICES}
        getRowId={(i) => i.id}
      />
    ));
    await settle();
    const number = screen.getByRole("columnheader", { name: "Number" });
    expect(number.hasAttribute("aria-sort")).toBe(false);
    expect(number.querySelector("svg")).toBeNull();
  });
});

describe("DataTable selection", () => {
  function Selecting(props: { onArchive?: (rows: readonly Invoice[]) => void }) {
    return (
      <>
        <DataTable
          label="Invoices"
          columns={COLUMNS}
          data={INVOICES}
          getRowId={(i) => i.id}
          selectionMode="multiple"
          selectionActions={[
            { label: "Export", onAction: () => {} },
            {
              label: "Archive",
              tone: "danger",
              confirm: (rows) => ({ title: `Archive ${String(rows.length)} invoices?` }),
              onAction: (rows) => props.onArchive?.(rows),
            },
          ]}
        />
        <ConfirmHost />
      </>
    );
  }

  test("each row has a checkbox named after it, and the header one selects them all", async () => {
    render(() => <Selecting />);
    await settle();
    const all = screen.getByRole("checkbox", { name: "Select all" });
    expect(screen.getByRole("checkbox", { name: "Select INV-002" })).toBeDefined();
    expect(screen.queryByRole("group", { name: "Selection" })).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "Select INV-002" }));
    await settle();
    expect(bodyRows()[1]?.getAttribute("aria-selected")).toBe("true");
    expect(bodyRows()[0]?.getAttribute("aria-selected")).toBe("false");
    expect((all as HTMLInputElement).indeterminate).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("1 selected");

    await user.click(all);
    await settle();
    expect(bodyRows().every((row) => row.getAttribute("aria-selected") === "true")).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("3 selected");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a row's checkbox selects it with no untracked read", async () => {
    render(() => <Selecting />);
    await settle();
    const capture = DEV.diagnostics.capture();
    await user.click(screen.getByRole("checkbox", { name: "Select INV-002" }));
    await settle();
    expect(bodyRows()[1]?.getAttribute("aria-selected")).toBe("true");
    const strict = capture.stop().filter((event) => event.code === "STRICT_READ_UNTRACKED");
    expect(strict).toEqual([]);
  });

  test("Space on a row selects it, and the bar's clear button lets go", async () => {
    const seen: string[][] = [];
    render(() => (
      <DataTable
        label="Invoices"
        columns={COLUMNS}
        data={INVOICES}
        getRowId={(i) => i.id}
        selectionMode="multiple"
        onSelectionChange={(keys) => seen.push([...keys])}
        selectionActions={[{ label: "Export", onAction: () => {} }]}
      />
    ));
    await settle();
    user.tab();
    await settle();
    await user.keyboard("{ArrowDown}");
    await user.keyboard(" ");
    await settle();
    expect(seen.at(-1)).toEqual(["b"]);
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    await settle();
    expect(seen.at(-1)).toEqual([]);
    expect(screen.queryByRole("group", { name: "Selection" })).toBeNull();
  });

  test("an action that asks first acts on the rows once confirmed, then clears", async () => {
    const archived: string[][] = [];
    render(() => <Selecting onArchive={(rows) => archived.push(rows.map((row) => row.id))} />);
    await settle();
    await user.click(screen.getByRole("checkbox", { name: "Select INV-001" }));
    await user.click(screen.getByRole("checkbox", { name: "Select INV-003" }));
    await settle();
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await settle();
    const dialog = await waitFor(() => screen.getByRole("alertdialog"));
    expect(dialog.textContent).toContain("Archive 2 invoices?");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(archived).toEqual([["a", "c"]]));
    await settle();
    expect(screen.queryByRole("group", { name: "Selection" })).toBeNull();
  });

  test("single selection has no checkboxes and takes one row", async () => {
    const seen: string[][] = [];
    render(() => (
      <DataTable
        label="Invoices"
        columns={COLUMNS}
        data={INVOICES}
        getRowId={(i) => i.id}
        selectionMode="single"
        onSelectionChange={(keys) => seen.push([...keys])}
      />
    ));
    await settle();
    expect(screen.queryByRole("checkbox")).toBeNull();
    await user.click(screen.getByText("Globex"));
    await user.click(screen.getByText("Initech"));
    await settle();
    expect(seen.at(-1)).toEqual(["c"]);
  });
});

describe("DataTable columns", () => {
  test("hides the columns the visibility leaves out, and follows it as it changes", async () => {
    const [visibility, setVisibility] = createSignal<ColumnVisibilityState>({ customer: false });
    render(() => (
      <DataTable
        label="Invoices"
        columns={COLUMNS}
        data={INVOICES}
        getRowId={(i) => i.id}
        columnVisibility={visibility()}
      />
    ));
    await settle();
    expect(screen.getAllByRole("columnheader").map((head) => head.textContent)).toEqual([
      "Number",
      "Total",
    ]);
    setVisibility({});
    await settle();
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
  });

  test("a column below its breakpoint is left out of the grid, not just hidden", async () => {
    viewport(500);
    try {
      render(() => (
        <DataTable
          label="Invoices"
          columns={[COLUMNS[0], { ...COLUMNS[1], hideBelow: "md" }, COLUMNS[2]] as never}
          data={INVOICES}
          getRowId={(i) => i.id}
        />
      ));
      await settle();
      expect(screen.getAllByRole("columnheader").map((head) => head.textContent)).toEqual([
        "Number",
        "Total",
      ]);
      expect(bodyRows()[0]?.querySelectorAll('[role="gridcell"]')).toHaveLength(1);
    } finally {
      viewport(1024);
    }
  });

  test("a wide screen shows it", async () => {
    render(() => (
      <DataTable
        label="Invoices"
        columns={[COLUMNS[0], { ...COLUMNS[1], hideBelow: "md" }, COLUMNS[2]] as never}
        data={INVOICES}
        getRowId={(i) => i.id}
      />
    ));
    await settle();
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
  });

  test("resizable columns get a handle a keyboard can work", async () => {
    const ends: string[][] = [];
    render(() => (
      <DataTable
        label="Invoices"
        columns={COLUMNS}
        data={INVOICES}
        getRowId={(i) => i.id}
        resizable
        onColumnResize={(widths) => ends.push([...widths.keys()])}
      />
    ));
    await settle();
    const handles = screen.getAllByRole("slider", { hidden: true });
    expect(handles).toHaveLength(3);
    expect(handles[0]?.getAttribute("aria-label")).toContain("Resize column");
    const frame = document.querySelector('[data-slot="data-table-frame"]') as HTMLElement;
    expect(frame.style.getPropertyValue("--arc-data-table-columns")).toBe(
      "max-content max-content max-content",
    );
    expect(screen.getAllByRole("columnheader")[0]?.style.width).not.toBe("");
  });
});

describe("DataTable rows", () => {
  test("a row with an href is a link the router follows; a button in it stays a button", async () => {
    const pressed: string[] = [];
    const columns: DataTableColumn<Invoice>[] = [
      ...COLUMNS,
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: (context) => (
          <button type="button" onClick={() => pressed.push(context.row.original.id)}>
            Remind
          </button>
        ),
      },
    ];
    function Invoices() {
      return (
        <DataTable
          label="Invoices"
          columns={columns}
          data={INVOICES}
          getRowId={(i) => i.id}
          rowHref={(invoice) => `/invoices/${invoice.id}`}
        />
      );
    }
    const view = await renderRoute({
      routeTree: [
        { path: "/invoices", component: Invoices },
        { path: "/invoices/$id", component: () => <p>Detail</p> },
      ] as never,
      path: "/invoices",
    });
    await settle();
    expect(bodyRows()[1]?.getAttribute("data-href")).toBe("/invoices/b");

    await user.click(screen.getAllByRole("button", { name: "Remind" })[0] as HTMLElement);
    await settle();
    expect(pressed).toEqual(["a"]);
    expect(view.state.location().pathname).toBe("/invoices");

    await user.click(screen.getByText("Globex"));
    await waitFor(() => expect(view.state.location().pathname).toBe("/invoices/b"));
    view.unmount();
  });

  test("Enter on a row runs its action", async () => {
    const opened: string[] = [];
    render(() => (
      <DataTable
        label="Invoices"
        columns={COLUMNS}
        data={INVOICES}
        getRowId={(i) => i.id}
        onRowAction={(invoice) => opened.push(invoice.id)}
      />
    ));
    await settle();
    user.tab();
    await settle();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    await settle();
    expect(opened).toEqual(["c"]);
  });

  test("while loading it draws skeleton rows and says it is busy", async () => {
    render(() => (
      <DataTable
        label="Invoices"
        columns={COLUMNS}
        data={undefined}
        getRowId={(i: Invoice) => i.id}
        skeletonRows={4}
      />
    ));
    await settle();
    expect(bodyRows()).toHaveLength(4);
    expect(bodyRows()[0]?.getAttribute("data-skeleton")).toBe("");
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(12);
    expect(screen.getByRole("grid").closest("[aria-busy]")?.getAttribute("aria-busy")).toBe("true");
  });

  test("with no rows it shows the empty state inside the grid", async () => {
    render(() => (
      <DataTable
        label="Invoices"
        columns={COLUMNS}
        data={[]}
        getRowId={(i: Invoice) => i.id}
        empty={<p>No invoices yet</p>}
      />
    ));
    await settle();
    const message = screen.getByText("No invoices yet");
    expect(message.closest('[role="gridcell"]')).not.toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("pages through the rows, a page at a time", async () => {
    render(() => (
      <DataTable
        label="Invoices"
        columns={COLUMNS}
        data={INVOICES}
        getRowId={(i) => i.id}
        pagination={{ pageSize: 2 }}
      />
    ));
    await settle();
    const pages = screen.getByRole("navigation", { name: "Pages" });
    expect(pages.textContent).toContain("Page 1 of 2");
    expect(texts()).toEqual(["INV-001", "INV-002"]);
    expect(screen.getByRole("button", { name: "Previous page" }).hasAttribute("disabled")).toBe(
      true,
    );
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await settle();
    expect(texts()).toEqual(["INV-003"]);
    expect(pages.textContent).toContain("Page 2 of 2");
  });

  test("a server's pages are shown as they arrive", async () => {
    const asked: number[] = [];
    render(() => (
      <DataTable
        label="Invoices"
        columns={COLUMNS}
        data={INVOICES}
        getRowId={(i) => i.id}
        pagination={{ pageSize: 3, pageCount: 4, onPageIndexChange: (page) => asked.push(page) }}
      />
    ));
    await settle();
    expect(texts()).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await settle();
    expect(asked).toEqual([1]);
    expect(texts()).toHaveLength(3);
  });

  test("a list that loads more has a loader row that is not one of the rows", async () => {
    render(() => (
      <DataTable
        label="Invoices"
        columns={COLUMNS}
        data={INVOICES}
        getRowId={(i) => i.id}
        onLoadMore={() => {}}
        isLoadingMore
      />
    ));
    await settle();
    const loader = screen.getAllByRole("row").at(-1) as HTMLElement;
    expect(loader.getAttribute("data-slot")).toBe("data-table-loader");
    expect(loader.textContent).toContain("Loading more");
    expect(document.querySelector("[data-load-more-sentinel]")).not.toBeNull();
    expect(bodyRows()).toHaveLength(3);
  });

  test("virtualised, only the rows in view are in the document", async () => {
    const many: Invoice[] = Array.from({ length: 200 }, (_, at) => ({
      id: `r${String(at)}`,
      number: `INV-${String(at).padStart(3, "0")}`,
      customer: "Acme",
      total: at,
    }));
    render(() => (
      <DataTable
        label="Invoices"
        columns={COLUMNS}
        data={many}
        getRowId={(i) => i.id}
        virtualRowHeight={40}
        height="400px"
      />
    ));
    await settle();
    const grid = screen.getByRole("grid");
    Object.defineProperty(grid, "clientHeight", { value: 400, configurable: true });
    Object.defineProperty(grid, "clientWidth", { value: 600, configurable: true });
    grid.dispatchEvent(new Event("scroll"));
    await settle();
    const rendered = bodyRows();
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(60);
    expect(rendered[0]?.style.position).toBe("absolute");
  });
});

describe("DataTable over a long list", () => {
  const invoices = (from: number, count: number): Invoice[] =>
    Array.from({ length: count }, (_, at) => ({
      id: `r${String(from + at)}`,
      number: `INV-${String(from + at).padStart(3, "0")}`,
      customer: "Acme",
      total: from + at,
    }));

  /** happy-dom lays nothing out, so the grid is told what a browser would report. */
  function scrollGrid(top: number): HTMLElement {
    const grid = screen.getByRole("grid");
    grid.style.overflow = "auto";
    Object.defineProperty(grid, "clientHeight", { value: 400, configurable: true });
    Object.defineProperty(grid, "clientWidth", { value: 600, configurable: true });
    Object.defineProperty(grid, "scrollTop", { value: top, writable: true, configurable: true });
    grid.dispatchEvent(new Event("scroll"));
    return grid;
  }

  const rowOf = (element: Element | null): HTMLElement | null =>
    element?.closest('[role="row"]') ?? null;

  function Long(props: { data: Invoice[] }) {
    return (
      <DataTable
        label="Invoices"
        columns={COLUMNS}
        data={props.data}
        getRowId={(i) => i.id}
        virtualRowHeight={40}
        height="400px"
      />
    );
  }

  test("each rendered row numbers itself among all the rows, past the header", async () => {
    render(() => <Long data={invoices(0, 200)} />);
    await settle();
    const grid = scrollGrid(4000);
    await settle();

    expect(grid.getAttribute("aria-rowcount")).toBe("201");
    const rendered = bodyRows();
    expect(rendered.length).toBeLessThan(60);
    expect(texts()).toContain("INV-100");
    for (const row of rendered) {
      const number = Number(row.querySelector('[role="rowheader"]')?.textContent?.slice(4));
      expect(row.getAttribute("aria-rowindex")).toBe(String(number + 2));
    }
  });

  test("the keyboard reaches rows that were never rendered", async () => {
    render(() => <Long data={invoices(0, 200)} />);
    await settle();
    scrollGrid(0);
    await settle();
    user.tab();
    await settle();
    expect(document.activeElement?.textContent).toBe("INV-000");

    await user.keyboard("{PageDown}");
    await settle();
    const paged = rowOf(document.activeElement);
    expect(Number(paged?.getAttribute("aria-rowindex"))).toBeGreaterThan(2 + 5);

    user.keyDown("End", { ctrlKey: true });
    user.keyUp("End", { ctrlKey: true });
    await settle();
    const last = rowOf(document.activeElement);
    expect(last?.getAttribute("aria-rowindex")).toBe("201");
    expect(last?.querySelector('[role="rowheader"]')?.textContent).toBe("INV-199");
  });

  test("rows added below leave the rows in view where they were", async () => {
    const [data, setData] = createSignal(invoices(0, 200));
    render(() => <Long data={data()} />);
    await settle();
    const grid = scrollGrid(4000);
    await settle();
    const before = bodyRows().map((row) => [row.textContent, row.style.top]);

    setData([...data(), ...invoices(200, 100)]);
    await settle();
    expect(grid.scrollTop).toBe(4000);
    expect(grid.getAttribute("aria-rowcount")).toBe("301");
    const after = bodyRows().map((row) => [row.textContent, row.style.top]);
    for (const entry of before) expect(after).toContainEqual(entry);
  });
});

describe("DataTable as a tree", () => {
  interface Team {
    id: string;
    name: string;
    size: number;
    teams?: Team[];
  }
  const TEAMS: Team[] = [
    {
      id: "eng",
      name: "Engineering",
      size: 40,
      teams: [
        { id: "web", name: "Web", size: 12 },
        { id: "api", name: "API", size: 9 },
      ],
    },
    { id: "ops", name: "Operations", size: 7 },
  ];
  const TEAM_COLUMNS: DataTableColumn<Team>[] = [
    { accessorKey: "name", header: "Team" },
    { accessorKey: "size", header: "People", align: "end" },
  ];
  const names = (): string[] =>
    [...document.querySelectorAll('[data-slot="data-table-row"]')].map(
      (row) => row.querySelector('[data-slot="data-table-cell"]')?.textContent ?? "",
    );

  test("a tree grid whose parents open on their button, a level per depth", async () => {
    const opened: string[][] = [];
    render(() => (
      <DataTable
        label="Teams"
        columns={TEAM_COLUMNS}
        data={TEAMS}
        getRowId={(team) => team.id}
        getSubRows={(team) => team.teams}
        onExpandedChange={(keys) => opened.push([...keys])}
      />
    ));
    await settle();
    expect(screen.getByRole("treegrid", { name: "Teams" })).toBeDefined();
    expect(names()).toEqual(["Engineering", "Operations"]);
    const eng = screen.getAllByRole("row")[1] as HTMLElement;
    expect(eng.getAttribute("aria-expanded")).toBe("false");
    user.click(within(eng).getByRole("button", { hidden: true }));
    await settle();
    expect(names()).toEqual(["Engineering", "Web", "API", "Operations"]);
    expect(opened.at(-1)).toEqual(["eng"]);
    const web = screen.getAllByRole("row")[2] as HTMLElement;
    expect(web.getAttribute("aria-level")).toBe("2");
    expect(web.querySelector('[data-slot="data-table-tree"]')?.getAttribute("style")).toContain(
      "--arc-row-depth: 1",
    );
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the arrows open and close a parent from its tree cell, in the reading direction", async () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <DataTable
          label="Teams"
          columns={TEAM_COLUMNS}
          data={TEAMS}
          getRowId={(team) => team.id}
          getSubRows={(team) => team.teams}
          defaultExpandedKeys={["eng"]}
        />
      </Arabic>
    ));
    await settle();
    expect(names()).toEqual(["Engineering", "Web", "API", "Operations"]);
    user.tab();
    await user.keyboard("{ArrowRight}");
    await settle();
    expect(names()).toEqual(["Engineering", "Operations"]);
    await user.keyboard("{ArrowLeft}");
    await settle();
    expect(names()).toEqual(["Engineering", "Web", "API", "Operations"]);
  });

  test("hydrates what the server wrote, open", async () => {
    const result = await hydrates(`
      import { DataTable } from "<arc>";
      const data = [{ id: "a", name: "Alpha", teams: [{ id: "b", name: "Beta" }] }];
      export function Page() {
        return (
          <DataTable
            label="Teams"
            columns={[{ accessorKey: "name", header: "Team" }]}
            data={data}
            getRowId={(team) => team.id}
            getSubRows={(team) => team.teams}
            defaultExpandedKeys={["a"]}
          />
        );
      }
    `);
    expect(result.container.querySelector('[role="treegrid"]')).not.toBeNull();
    expect(result.container.textContent).toContain("Beta");
    result.unmount();
  });
});

describe("DataTable on a server", () => {
  test("hydrates a cell that renders a component of its own", async () => {
    const result = await hydrates(`
      import { DataTable, Status } from "<arc>";
      const data = [{ id: "a", number: "INV-001", state: "Paid" }];
      export function Page() {
        return (
          <DataTable
            label="Invoices"
            columns={[
              { accessorKey: "number", header: "Number" },
              { accessorKey: "state", header: "State", cell: (context) => <Status tone="success">{context.row.original.state}</Status> },
            ]}
            data={data}
            getRowId={(invoice) => invoice.id}
          />
        );
      }
    `);
    expect(result.container.querySelector('[data-slot="status"]')?.textContent).toBe("Paid");
    result.unmount();
  });
});
