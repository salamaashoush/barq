import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import TableActions from "./table-actions.tsx";
import TableDemo from "./table-demo.tsx";
import TableSelected from "./table-selected.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("the table examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("table")).toEqual([]);
  });

  test("the invoices table has a caption, seven rows and a footer total", () => {
    render(() => <TableDemo />);
    expect(document.querySelector('[data-slot="table-caption"]')?.textContent).toBe(
      "A list of your recent invoices.",
    );
    expect(
      document.querySelectorAll('[data-slot="table-body"] [data-slot="table-row"]'),
    ).toHaveLength(7);
    expect(document.querySelector('[data-slot="table-footer"]')?.textContent).toContain(
      "$2,250.00",
    );
  });

  test("a row's menu opens with its three actions", async () => {
    render(() => <TableActions />);
    const triggers = screen.getAllByRole("button", { name: /^Open menu for / });
    expect(triggers).toHaveLength(3);

    await user.click(triggers[0] as HTMLElement);
    await settle();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Edit",
      "Duplicate",
      "Delete",
    ]);
    expect(screen.getByRole("separator")).not.toBeNull();

    await user.keyboard("{Escape}");
    await settle();
    expect(screen.queryAllByRole("menu")).toHaveLength(0);
  });

  test("a selected row says so", () => {
    render(() => <TableSelected />);
    expect(document.querySelectorAll('[data-slot="table-row"][data-state="selected"]').length).toBe(
      1,
    );
  });
});
