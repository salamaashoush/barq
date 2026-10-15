import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import DataTableDemo from "./data-table-demo.tsx";
import DataTableRtl from "./data-table-rtl.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const rows = (): Element[] => [
  ...document.querySelectorAll('[data-slot="table-body"] [data-slot="table-row"]'),
];

const cells = (row: Element | undefined): string[] =>
  [...(row?.querySelectorAll('[data-slot="table-cell"]') ?? [])].map(
    (cell) => cell.textContent ?? "",
  );

const headers = (): string[] =>
  [...document.querySelectorAll('[data-slot="table-head"]')].map((head) => head.textContent ?? "");

describe("the data table examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("data-table")).toEqual([]);
  });

  test("the demo sorts by email from the header", async () => {
    render(() => <DataTableDemo />);
    expect(cells(rows()[0])).toEqual(["", "success", "salama@example.com", "$316.00", "Open menu"]);

    await user.click(screen.getByRole("button", { name: "Email" }));
    await settle();
    expect(cells(rows()[0])[2]).toBe("Ada45@example.com");

    await user.click(screen.getByRole("button", { name: "Email" }));
    await settle();
    expect(cells(rows()[0])[2]).toBe("Zed44@example.com");
  });

  test("the demo filters by email, and says so when nothing matches", async () => {
    render(() => <DataTableDemo />);
    const filter = screen.getByRole("textbox", { name: "Filter emails" });
    expect(rows()).toHaveLength(5);

    await user.type(filter, "sa");
    await settle();
    expect(rows().map((row) => cells(row)[2])).toEqual(["salama@example.com", "Sam07@example.com"]);

    await user.type(filter, "nobody");
    await settle();
    expect(rows().map((row) => cells(row))).toEqual([["No results."]]);
  });

  test("the demo pages forward and back", async () => {
    render(() => <DataTableDemo />);
    const previous = screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "Next" }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);

    await user.click(next);
    await settle();
    expect(rows().map((row) => cells(row)[2])).toEqual([
      "noor@example.com",
      "Sam07@example.com",
      "kai@example.com",
    ]);
    expect(next.disabled).toBe(true);

    await user.click(previous);
    await settle();
    expect(rows()).toHaveLength(5);
  });

  test("the demo counts the selected rows, and the header selects the page", async () => {
    render(() => <DataTableDemo />);
    expect(screen.getByText("0 of 8 row(s) selected.")).toBeTruthy();

    await user.click(screen.getAllByRole("checkbox", { name: "Select row" })[1]!);
    await settle();
    expect(screen.getByText("1 of 8 row(s) selected.")).toBeTruthy();
    expect(rows()[1]?.getAttribute("data-state")).toBe("selected");
    expect(rows()[0]?.getAttribute("data-state")).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    await settle();
    expect(screen.getByText("5 of 8 row(s) selected.")).toBeTruthy();
  });

  test("the demo hides a column from the menu", async () => {
    render(() => <DataTableDemo />);
    expect(headers()).toEqual(["", "Status", "Email", "Amount", ""]);

    await user.click(screen.getByRole("button", { name: "Columns" }));
    await settle();
    expect(screen.getAllByRole("menuitemcheckbox").map((item) => item.textContent)).toEqual([
      "status",
      "email",
      "amount",
    ]);

    await user.click(screen.getByRole("menuitemcheckbox", { name: "amount" }));
    await settle();
    expect(headers()).toEqual(["", "Status", "Email", ""]);
    expect(cells(rows()[0])).toEqual(["", "success", "salama@example.com", "Open menu"]);

    await user.keyboard("{Escape}");
    await settle();
  });

  test("the demo's row menu lists the actions for that payment", async () => {
    render(() => <DataTableDemo />);
    await user.click(screen.getAllByRole("button", { name: "Open menu" })[0]!);
    await settle();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Copy payment ID",
      "View customer",
      "View payment details",
    ]);

    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("the right-to-left table names its direction and translates its statuses", () => {
    render(() => <DataTableRtl />);
    const table = screen.getByRole("table");
    expect(table.closest('[dir="rtl"]')).not.toBeNull();
    expect(table.textContent).toContain("ناجح");
    expect(screen.getByRole("textbox", { name: "تصفية البريد الإلكتروني" })).toBeTruthy();
  });
});
