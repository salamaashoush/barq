import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table.tsx";

function Invoices(props: { selected?: boolean }) {
  return (
    <Table aria-label="Invoices">
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow isSelected={props.selected}>
          <TableCell>INV001</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

const bodyRow = (): HTMLElement => screen.getAllByRole("row")[1] as HTMLElement;

describe("Table", () => {
  test("a selected row says so the way upstream's data tables do", () => {
    render(() => <Invoices selected />);
    expect(bodyRow().getAttribute("data-state")).toBe("selected");
    expect(bodyRow().getAttribute("data-selected")).toBe("");
    expect(bodyRow().getAttribute("aria-selected")).toBe("true");
  });

  test("a row that is not selected carries no state", () => {
    render(() => <Invoices />);
    expect(bodyRow().hasAttribute("data-state")).toBe(false);
    expect(bodyRow().hasAttribute("data-selected")).toBe(false);
  });

  test("a caller writing the attribute itself gets the tint", () => {
    render(() => (
      <Table aria-label="Invoices">
        <TableBody>
          <TableRow data-state="selected">
            <TableCell>INV001</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    ));
    const row = screen.getByRole("row");
    expect(row.getAttribute("data-state")).toBe("selected");
    expect(rulesFor(row.className)).toContain(
      '[data-state="selected"]{background-color: var(--muted)',
    );
  });

  test("a heading starts where the text starts, in either direction", () => {
    render(() => <Invoices />);
    const head = rulesFor(screen.getByRole("columnheader").className);
    expect(head).toContain("text-align: start");
    expect(head).not.toContain("text-align: left");
    expect(head).toContain(':has([role="checkbox"]){padding-inline-end: 0px');
    expect(head).not.toContain("padding-right");

    const cell = rulesFor(screen.getByRole("cell").className);
    expect(cell).toContain(':has([role="checkbox"]){padding-inline-end: 0px');
    expect(cell).not.toContain("padding-right: 0px");
  });
});
