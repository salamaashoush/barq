import { describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import type { ColumnVisibilityState } from "@barqjs/table";
import { ariaViolations, render, screen, tick, user, waitFor } from "@barqjs/testing";
import { renderRoute } from "@barqjs/testing/router";

import { DataToolbar, type DataToolbarFilter } from "./data-toolbar.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const STATUS: DataToolbarFilter = {
  id: "status",
  label: "Status",
  options: [
    { value: "draft", label: "Draft", count: 4 },
    { value: "sent", label: "Sent", count: 9 },
    { value: "paid", label: "Paid", count: 2 },
  ],
};

const chip = (name: string): HTMLElement =>
  [...document.querySelectorAll<HTMLElement>('[data-slot="data-toolbar-filter"]')].find((one) =>
    one.textContent?.startsWith(name),
  ) as HTMLElement;

describe("DataToolbar", () => {
  test("is a search landmark holding a named search field, the filters and the actions", async () => {
    render(() => (
      <DataToolbar
        search={{ label: "Search invoices", placeholder: "Search" }}
        filters={[STATUS]}
        actions={<button type="button">New invoice</button>}
      />
    ));
    await settle();
    const landmark = screen.getByRole("search", { name: "Filters" });
    expect(landmark.contains(screen.getByRole("searchbox", { name: "Search invoices" }))).toBe(
      true,
    );
    expect(chip("Status").getAttribute("data-active")).toBe("false");
    expect(screen.getByRole("button", { name: "New invoice" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("typing searches, and Clear filters empties it", async () => {
    const seen: string[] = [];
    render(() => (
      <DataToolbar search={{ label: "Search", onChange: (value) => seen.push(value) }} />
    ));
    await settle();
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "ac");
    await settle();
    expect(seen).toEqual(["a", "ac"]);
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await settle();
    expect(seen.at(-1)).toBe("");
    expect(screen.getByRole<HTMLInputElement>("searchbox").value).toBe("");
  });

  test("a filter chip opens its options from the keyboard; Space ticks one and keeps it open", async () => {
    const seen: string[][] = [];
    render(() => <DataToolbar filters={[{ ...STATUS, onChange: (value) => seen.push(value) }]} />);
    await settle();
    chip("Status").focus();
    await user.keyboard("{Enter}");
    await settle();
    const menu = await waitFor(() => screen.getByRole("menu", { name: "Status" }));
    expect(screen.getAllByRole("menuitemcheckbox").map((item) => item.textContent)).toEqual([
      "Draft4",
      "Sent9",
      "Paid2",
    ]);
    await user.keyboard("{ArrowDown}");
    await user.keyboard(" ");
    await settle();
    expect(seen.at(-1)).toEqual(["sent"]);
    expect(menu.isConnected).toBe(true);
    expect(await ariaViolations(menu)).toEqual([]);

    await user.keyboard("{Escape}");
    await settle();
    expect(chip("Status").getAttribute("data-active")).toBe("true");
    expect(chip("Status").textContent).toContain("Sent");
  });

  test("a single-value filter swaps its value", async () => {
    const seen: string[][] = [];
    render(() => (
      <DataToolbar
        filters={[{ ...STATUS, multiple: false, onChange: (value) => seen.push(value) }]}
      />
    ));
    await settle();
    await user.click(chip("Status"));
    await settle();
    await user.click(await waitFor(() => screen.getByRole("menuitemradio", { name: /^Paid/ })));
    await settle();
    expect(seen.at(-1)).toEqual(["paid"]);
  });

  test("the search and the filters live in the URL when bound to parameters", async () => {
    function Invoices() {
      return (
        <DataToolbar
          search={{ label: "Search", param: "q" }}
          filters={[{ ...STATUS, param: "status" }]}
        />
      );
    }
    const view = await renderRoute({
      routeTree: [{ path: "/invoices", component: Invoices }] as never,
      path: "/invoices?status=draft,paid&page=2",
    });
    await settle();
    expect(chip("Status").textContent).toContain("Draft, Paid");

    await user.type(screen.getByRole("searchbox", { name: "Search" }), "x");
    await waitFor(() => expect(view.state.search().get("q")).toBe("x"));
    expect(view.state.search().get("page")).toBe("2");

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(view.state.search().has("status")).toBe(false));
    expect(view.state.search().has("q")).toBe(false);
    expect(view.state.search().get("page")).toBe("2");
    view.unmount();
  });

  test("the view options show and hide columns", async () => {
    const [visibility, setVisibility] = createSignal<ColumnVisibilityState>({});
    render(() => (
      <DataToolbar
        columns={[
          { id: "customer", label: "Customer" },
          { id: "total", label: "Total" },
        ]}
        columnVisibility={visibility()}
        onColumnVisibilityChange={setVisibility}
      />
    ));
    await settle();
    await user.click(screen.getByRole("button", { name: "View" }));
    await settle();
    const customer = await waitFor(() =>
      screen.getByRole("menuitemcheckbox", { name: "Customer" }),
    );
    expect(customer.getAttribute("aria-checked")).toBe("true");
    await user.click(customer);
    await settle();
    expect(visibility()).toEqual({ customer: false });
    expect(customer.getAttribute("aria-checked")).toBe("false");
  });

  test("while rows are selected, it says how many and holds their actions", async () => {
    let cleared = 0;
    render(() => (
      <DataToolbar
        search={{ label: "Search" }}
        selection={{
          count: 3,
          onClear: () => cleared++,
          actions: <button type="button">Archive</button>,
        }}
      />
    ));
    await settle();
    expect(screen.getByRole("status").textContent).toBe("3 selected");
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Archive" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(cleared).toBe(1);
  });
});
