import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { DataTableCount, DataTableNote } from "./data-table-parts.tsx";
import { type DataTableColumn, DataTable } from "./data-table.tsx";
import { SelectionBar } from "./selection-bar.tsx";

interface Incident {
  id: string;
  title: string;
  state: "open" | "acknowledged" | "resolved";
  cost: number;
}

const INCIDENTS: Incident[] = [
  { id: "a", title: "Checkout is slow", state: "open", cost: 120 },
  { id: "b", title: "Sign in fails", state: "acknowledged", cost: 80 },
  { id: "c", title: "Search times out", state: "open", cost: 300 },
  { id: "d", title: "Status page stale", state: "resolved", cost: 20 },
];

const COLUMNS: DataTableColumn<Incident>[] = [
  { accessorKey: "title", header: "Incident" },
  { accessorKey: "state", header: "State" },
  { accessorKey: "cost", header: "Cost", align: "end" },
];

function rows(): HTMLElement[] {
  return screen
    .getAllByRole("row")
    .filter((row) => row.getAttribute("data-slot") === "data-table-row");
}

function Arabic(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("DataTable states", () => {
  test("a failed load says so in place of the rows, with the request id and Try again", async () => {
    let tries = 0;
    let finish: () => void = () => {};
    render(() => (
      <DataTable
        label="Incidents"
        columns={COLUMNS}
        data={undefined}
        getRowId={(row) => row.id}
        error={{ message: "The server is restarting.", requestId: "req_42" }}
        onRetry={() => {
          tries += 1;
          return new Promise<void>((resolve) => {
            finish = resolve;
          });
        }}
      />
    ));
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.getByText("Could not load incidents")).toBeDefined();
    expect(screen.getByText(/The server is restarting/)).toBeDefined();
    expect(document.querySelector('[data-slot="data-table-request-id"]')?.textContent).toBe(
      "Request ID req_42",
    );
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(await ariaViolations(document.body)).toEqual([]);
    await user.click(retry);
    await settle();
    expect(tries).toBe(1);
    expect(
      retry.hasAttribute("data-pending") || retry.getAttribute("aria-disabled") === "true",
    ).toBe(true);
    finish();
    await settle();
  });

  test("without onRetry there is no button", () => {
    render(() => (
      <DataTable
        label="Incidents"
        columns={COLUMNS}
        data={INCIDENTS}
        getRowId={(row) => row.id}
        error={{ message: "Gone" }}
      />
    ));
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("the footer holds a note or the shown count with Load more", async () => {
    let asked = 0;
    render(() => (
      <DataTable
        label="Incidents"
        columns={COLUMNS}
        data={INCIDENTS}
        getRowId={(row) => row.id}
        footer={
          <>
            <DataTableNote>Incidents no route covers go to the on-call owner.</DataTableNote>
            <DataTableCount shown={4} hasMore onLoadMore={() => (asked += 1)} />
          </>
        }
      />
    ));
    expect(screen.getByText("Incidents no route covers go to the on-call owner.")).toBeDefined();
    expect(screen.getByRole("status").textContent).toBe("Showing 4");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(asked).toBe(1);
  });

  test("the count says all loaded, or of how many, and hides under its minimum", () => {
    render(() => (
      <div>
        <DataTableCount shown={40} />
        <DataTableCount shown={25} total={120} />
        <DataTableCount shown={3} minRows={25} />
      </div>
    ));
    expect(screen.getAllByRole("status").map((one) => one.textContent)).toEqual([
      "Showing 40, all loaded",
      "Showing 25 of 120",
    ]);
  });

  test("the row whose detail is open is aria-current, and follows the caller", async () => {
    const [active, setActive] = createSignal<string | null>("b");
    render(() => (
      <DataTable
        label="Incidents"
        columns={COLUMNS}
        data={INCIDENTS}
        getRowId={(row) => row.id}
        activeKey={active()}
      />
    ));
    expect(rows().map((row) => row.getAttribute("aria-current"))).toEqual([
      null,
      "true",
      null,
      null,
    ]);
    setActive("d");
    await settle();
    expect(rows()[3]?.getAttribute("aria-current")).toBe("true");
    expect(rows()[1]?.getAttribute("aria-current")).toBeNull();
  });

  test("its own density, whatever the page's", () => {
    render(() => (
      <DataTable
        label="Runs"
        columns={COLUMNS}
        data={INCIDENTS}
        getRowId={(row) => row.id}
        density="compact"
      />
    ));
    expect(document.querySelector('[data-slot="data-table"]')?.getAttribute("data-density")).toBe(
      "compact",
    );
  });

  test("totals sit under the rows in the columns they sum", () => {
    render(() => (
      <DataTable
        label="Incidents"
        columns={COLUMNS}
        data={INCIDENTS}
        getRowId={(row) => row.id}
        totals={[{ id: "sum", label: "Total", cells: { cost: "520" } }]}
      />
    ));
    const table = screen.getByRole("table", { name: "Totals" });
    expect(within(table).getByRole("rowheader").textContent).toBe("Total");
    expect(
      within(table)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["", "520"]);
  });

  test("a row's inline action sits beside it and the rest are in a menu named after it", async () => {
    const done: string[] = [];
    render(() => (
      <DataTable
        label="Incidents"
        columns={COLUMNS}
        data={INCIDENTS.slice(0, 2)}
        getRowId={(row) => row.id}
        rowActions={(row) => [
          { label: "Acknowledge", inline: true, onAction: () => void done.push(`ack ${row.id}`) },
          { label: "Resolve", onAction: () => void done.push(`resolve ${row.id}`) },
          { label: "Delete", tone: "danger", onAction: () => void done.push(`delete ${row.id}`) },
        ]}
      />
    ));
    expect(screen.getAllByRole("columnheader").at(-1)?.textContent).toBe("Actions");
    await user.click(screen.getAllByRole("button", { name: "Acknowledge" })[0] as HTMLElement);
    await settle();
    expect(done).toEqual(["ack a"]);
    await user.click(screen.getByRole("button", { name: "Actions for Sign in fails" }));
    await settle();
    await user.click(await waitFor(() => screen.getByRole("menuitem", { name: "Resolve" })));
    await settle();
    expect(done).toEqual(["ack a", "resolve b"]);
  });

  test("as cards, each row a list item with its title, fact, status and menu", async () => {
    const [active] = createSignal("c");
    render(() => (
      <DataTable
        label="Incidents"
        columns={COLUMNS}
        data={INCIDENTS}
        getRowId={(row) => row.id}
        layout="cards"
        activeKey={active()}
        rowHref={(row) => `/incidents/${row.id}`}
        card={{
          title: (row) => row.title,
          fact: (row) => `Costs ${String(row.cost)}`,
          status: (row) => <span>{row.state}</span>,
        }}
        rowActions={() => [{ label: "Resolve", inline: true, onAction: () => {} }]}
        totals={[{ id: "sum", label: "Total", cells: { cost: "520" } }]}
      />
    ));
    const list = screen.getByRole("list", { name: "Incidents" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(
      within(items[0] as HTMLElement)
        .getByRole("link")
        .getAttribute("href"),
    ).toBe("/incidents/a");
    expect(items[0]?.textContent).toContain("Costs 120");
    expect(items[2]?.getAttribute("aria-current")).toBe("true");
    expect(
      within(items[1] as HTMLElement).getByRole("button", { name: "Actions for Sign in fails" }),
    ).toBeDefined();
    expect(items[4]?.textContent).toContain("Total");
    expect(items[4]?.textContent).toContain("520");
    expect(await ariaViolations(list)).toEqual([]);
  });

  test("a selected row a filter takes off the screen leaves the selection", async () => {
    const [shown, setShown] = createSignal<Incident[]>(INCIDENTS);
    const seen: string[][] = [];
    render(() => (
      <DataTable
        label="Incidents"
        columns={COLUMNS}
        data={shown()}
        getRowId={(row) => row.id}
        selectionMode="multiple"
        onSelectionChange={(keys) => seen.push([...keys].toSorted())}
        selectionActions={[{ label: "Resolve", onAction: () => {} }]}
      />
    ));
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    await settle();
    expect(screen.getByRole("status").textContent).toBe("4 selected");
    setShown(INCIDENTS.filter((row) => row.state === "open"));
    await settle();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("2 selected"));
    expect(seen.at(-1)).toEqual(["a", "c"]);
    setShown(INCIDENTS);
    await settle();
    expect(screen.getByRole("status").textContent).toBe("2 selected");
  });

  test("hydrates the error, the footer, the cards and the totals", async () => {
    const result = await hydrates(`
      import { DataTable, DataTableCount } from "<arc>";
      const data = [{ id: "a", name: "Alpha", cost: 3 }, { id: "b", name: "Beta", cost: 4 }];
      const columns = [{ accessorKey: "name", header: "Name" }, { accessorKey: "cost", header: "Cost", align: "end" }];
      export function Page() {
        return (
          <div>
            <DataTable label="Broken" columns={columns} data={undefined} getRowId={(r) => r.id} error={{ message: "Down" }} onRetry={() => {}} />
            <DataTable
              label="Costs"
              columns={columns}
              data={data}
              getRowId={(r) => r.id}
              activeKey="b"
              density="compact"
              card={{ title: (r) => r.name }}
              totals={[{ id: "t", label: "Total", cells: { cost: "7" } }]}
              rowActions={() => [{ label: "Open", inline: true, onAction: () => {} }, { label: "Delete", tone: "danger", onAction: () => {} }]}
              footer={<DataTableCount shown={2} />}
            />
          </div>
        );
      }
    `);
    expect(result.container.textContent).toContain("Could not load broken");
    expect(result.container.textContent).toContain("Showing 2, all loaded");
    expect(result.container.querySelector('[aria-current="true"]')).not.toBeNull();
    result.unmount();
  });

  test("runs right to left", async () => {
    render(() => (
      <Arabic>
        <DataTable
          label="الحوادث"
          columns={COLUMNS}
          data={INCIDENTS}
          getRowId={(row) => row.id}
          rowActions={() => [{ label: "حل", onAction: () => {} }]}
          footer={<DataTableCount shown={4} total={9} />}
        />
      </Arabic>
    ));
    expect(screen.getByRole("status").textContent).toBe("Showing ٤ of ٩");
    expect(screen.getAllByRole("button", { name: /^Actions for/ })).toHaveLength(4);
  });
});

describe("SelectionBar eligibility and per-row runs", () => {
  test("an action fits only the rows it applies to, says how many, and is disabled for none", async () => {
    const acted: string[][] = [];
    const [picked, setPicked] = createSignal<Incident[]>(INCIDENTS.slice(0, 3));
    render(() => (
      <SelectionBar
        count={picked().length}
        rows={picked()}
        onClear={() => setPicked([])}
        actions={[
          {
            label: "Acknowledge",
            appliesTo: (row) => row.state === "open",
            onAction: (chosen) => void acted.push(chosen.map((row) => row.id)),
          },
          {
            label: "Resolve",
            appliesTo: (row) => row.state !== "resolved",
            onAction: () => {},
          },
        ]}
      />
    ));
    const acknowledge = screen.getByRole("button", { name: "Acknowledge, applies to 2 of 3" });
    expect(screen.getByRole("button", { name: "Resolve" })).toBeDefined();
    await user.click(acknowledge);
    await settle();
    expect(acted).toEqual([["a", "c"]]);

    setPicked([INCIDENTS[3] as Incident]);
    await settle();
    const none = screen.getByRole("button", { name: /^Acknowledge/ });
    expect(none.hasAttribute("disabled") || none.getAttribute("aria-disabled") === "true").toBe(
      true,
    );
  });

  test("each row is tried, refusals keep their rows selected with the reason and a Retry", async () => {
    const refuse = new Set(["b"]);
    const tried: string[] = [];
    const [picked, setPicked] = createSignal<Incident[]>(INCIDENTS.slice(0, 3));
    let settledWith: unknown;
    render(() => (
      <SelectionBar
        count={picked().length}
        rows={picked()}
        onClear={() => setPicked([])}
        onKeep={(kept) => setPicked([...kept])}
        actions={[
          {
            label: "Mute",
            concurrency: 1,
            onEach: async (row) => {
              tried.push(row.id);
              if (refuse.has(row.id)) throw new Error("You may not mute Sign in fails.");
            },
            onSettled: (result) => {
              settledWith = { done: result.done.length, failed: result.failed.length };
            },
          },
        ]}
      />
    ));
    await user.click(screen.getByRole("button", { name: "Mute" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    expect(tried).toEqual(["a", "b", "c"]);
    expect(settledWith).toEqual({ done: 2, failed: 1 });
    expect(screen.getByRole("alert").textContent).toContain(
      "2 of 3 went through. You may not mute Sign in fails.",
    );
    expect(screen.getByRole("status").textContent).toBe("1 selected");

    refuse.clear();
    await user.click(screen.getByRole("button", { name: "Retry failed" }));
    await waitFor(() => expect(picked()).toEqual([]));
    expect(tried).toEqual(["a", "b", "c", "b"]);
  });

  test("the bar counts the rows as they settle", async () => {
    const waiting: (() => void)[] = [];
    render(() => (
      <SelectionBar
        count={2}
        rows={INCIDENTS.slice(0, 2)}
        onClear={() => {}}
        actions={[
          {
            label: "Run",
            onEach: () =>
              new Promise<void>((resolve) => {
                waiting.push(resolve);
              }),
          },
        ]}
      />
    ));
    await user.click(screen.getByRole("button", { name: "Run" }));
    await settle();
    expect(screen.getByRole("status").textContent).toBe("0 of 2 done");
    waiting[0]?.();
    await settle();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("1 of 2 done"));
    waiting[1]?.();
    await settle();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("2 selected"));
  });

  test("inside a DataTable, refused rows stay selected", async () => {
    render(() => (
      <DataTable
        label="Incidents"
        columns={COLUMNS}
        data={INCIDENTS}
        getRowId={(row) => row.id}
        selectionMode="multiple"
        selectionActions={[
          {
            label: "Close",
            onEach: async (row) => {
              if (row.id === "c") throw new Error("Search times out is locked.");
            },
          },
        ]}
      />
    ));
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    await settle();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    await settle();
    expect(screen.getByRole("status").textContent).toBe("1 selected");
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: /Search times out/ }).checked,
    ).toBe(true);
  });
});
