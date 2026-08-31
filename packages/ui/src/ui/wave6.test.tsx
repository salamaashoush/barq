import { describe, expect, test } from "bun:test";
import { collectCss } from "@barqjs/css";
import { flush } from "@barqjs/core";
import { render, screen } from "@barqjs/testing";

import { Slider } from "./slider.tsx";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./table.tsx";

function rulesFor(className: string): string {
  const mentions = new RegExp(`\\.${className}(?![\\w-])`);
  return collectCss()
    .split("@layer barq.ui{")
    .filter((chunk) => mentions.test(chunk))
    .join("\n");
}

describe("Table", () => {
  test("is a real table, scrollable, with every part addressable", () => {
    render(() => (
      <Table>
        <TableCaption>Invoices</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow isSelected>
            <TableCell>INV001</TableCell>
            <TableCell>£250</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>Total</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    ));

    expect(screen.getByRole("table", { name: "Invoices" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((n) => n.textContent)).toEqual([
      "Invoice",
      "Amount",
    ]);
    expect(document.querySelector('[data-slot="table-container"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="table-footer"]')).not.toBeNull();
  });

  test("a selected row says so to the CSS and to a reader", () => {
    render(() => (
      <Table>
        <TableBody>
          <TableRow isSelected>
            <TableCell>a</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    ));
    const row = screen.getByRole("row");
    expect(row.getAttribute("data-selected")).toBe("");
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(rulesFor(row.className.split(" ")[0] ?? "")).toContain(
      "[data-selected]{background-color: var(--muted)}",
    );
  });

  test("a header cell is a column header by default", () => {
    render(() => (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
    ));
    expect(screen.getByRole("columnheader").getAttribute("scope")).toBe("col");
  });
});

describe("Slider", () => {
  test("one value is one range input", () => {
    render(() => <Slider aria-label="Volume" defaultValue={30} />);
    const inputs = screen.getAllByRole("slider") as HTMLInputElement[];
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.value).toBe("30");
  });

  test("two values are two, and the fill spans between them", () => {
    render(() => <Slider aria-label="Price" defaultValue={[20, 60]} />);
    expect(screen.getAllByRole("slider")).toHaveLength(2);

    const track = document.querySelector('[data-slot="slider-track"]') as HTMLElement;
    expect(track.style.getPropertyValue("--barq-slider-start")).toBe("20%");
    expect(track.style.getPropertyValue("--barq-slider-end")).toBe("60%");
  });

  test("a single value fills from the start", () => {
    render(() => <Slider aria-label="Volume" defaultValue={30} />);
    const track = document.querySelector('[data-slot="slider-track"]') as HTMLElement;
    expect(track.style.getPropertyValue("--barq-slider-start")).toBe("0%");
    expect(track.style.getPropertyValue("--barq-slider-end")).toBe("30%");
  });

  test("the fill is drawn by the track, not by an element", () => {
    render(() => <Slider aria-label="Volume" defaultValue={30} />);
    const track = document.querySelector('[data-slot="slider-track"]') as HTMLElement;
    expect(track.querySelector('[data-slot="slider-range"]')).toBeNull();
    expect(track.className.split(" ").map(rulesFor).join("")).toContain("linear-gradient");
  });

  test("the track clips nothing, because the thumb is inside it", () => {
    render(() => <Slider aria-label="Volume" defaultValue={30} />);
    const track = document.querySelector('[data-slot="slider-track"]') as HTMLElement;
    // `overflow: hidden` is shadcn's way of clipping its `<SliderRange>` to the
    // rounded track. Here the thumb is a CHILD of the track, so the same rule
    // cut a 16px thumb down to the track's 6px. A background needs no clipping.
    expect(track.className.split(" ").map(rulesFor).join("")).not.toContain("overflow: hidden");
  });

  test("the thumb is centred across the track, not hung from its top", () => {
    render(() => <Slider aria-label="Volume" defaultValue={30} />);
    const thumb = document.querySelector('[data-slot="slider-thumb"]') as HTMLElement;
    const rules = thumb.className.split(" ").map(rulesFor).join("");
    expect(rules).toContain("top: 50%");
    expect(rules).toContain("translate: -50% -50%");
  });

  test("moving the input reports the value and moves the thumb", () => {
    const seen: number[][] = [];
    render(() => (
      <Slider aria-label="Volume" defaultValue={30} onChange={(value) => seen.push(value)} />
    ));

    // happy-dom does not implement a range input's own arrow-key handling, so
    // the value is set the way the browser would set it.
    const input = screen.getByRole("slider") as HTMLInputElement;
    input.value = "55";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();

    expect(seen.at(-1)).toEqual([55]);
    const thumb = document.querySelector('[data-slot="slider-thumb"]') as HTMLElement;
    expect(thumb.style.getPropertyValue("--barq-slider-thumb")).toBe("55%");
  });

  test("the thumb is placed with a custom property", () => {
    render(() => <Slider aria-label="Volume" defaultValue={30} />);
    const thumb = document.querySelector('[data-slot="slider-thumb"]') as HTMLElement;
    expect(thumb.style.getPropertyValue("--barq-slider-thumb")).toBe("30%");
  });

  test("the rule that reads it keys off the TRACK's orientation", () => {
    render(() => <Slider aria-label="Volume" defaultValue={30} />);
    const thumb = document.querySelector('[data-slot="slider-thumb"]') as HTMLElement;
    const rules = thumb.className.split(" ").map(rulesFor).join("");
    // `&[data-orientation=…]` matched nothing: the thumb carries no such
    // attribute, so every thumb sat at `left: 0` whatever its value.
    expect(rules).toContain('[data-orientation="horizontal"] .');
    expect(rules).not.toMatch(/\.[a-z0-9]+\[data-orientation/);
  });
});
