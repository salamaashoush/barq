import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import CheckboxDemo from "./checkbox-demo.tsx";
import CheckboxDisabled from "./checkbox-disabled.tsx";
import CheckboxInvalid from "./checkbox-invalid.tsx";
import CheckboxRtl from "./checkbox-rtl.tsx";
import CheckboxStates from "./checkbox-states.tsx";
import CheckboxTable from "./checkbox-table.tsx";

const box = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
const boxes = (): HTMLInputElement[] => screen.getAllByRole("checkbox") as HTMLInputElement[];

describe("the checkbox examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("checkbox")).toEqual([]);
  });

  test("a press on the box and a press on its label each toggle it once", async () => {
    render(() => <CheckboxDemo />);
    expect(box("checkbox-demo-terms").checked).toBe(false);
    expect(box("checkbox-demo-terms-2").checked).toBe(true);

    await user.click(box("checkbox-demo-terms"));
    flush();
    expect(box("checkbox-demo-terms").checked).toBe(true);

    await user.click(document.querySelector('label[for="checkbox-demo-terms"]') as HTMLElement);
    flush();
    expect(box("checkbox-demo-terms").checked).toBe(false);
  });

  test("a press on the card's title ticks the box inside the card", async () => {
    render(() => <CheckboxDemo />);
    await user.click(document.querySelector('[data-slot="field-title"]') as HTMLElement);
    flush();
    expect(box("checkbox-demo-toggle-2").checked).toBe(true);
  });

  test("the disabled box stays clear and its field says so", async () => {
    render(() => <CheckboxDisabled />);
    expect(box("checkbox-disabled-toggle").disabled).toBe(true);
    await user.click(box("checkbox-disabled-toggle"));
    flush();
    expect(box("checkbox-disabled-toggle").checked).toBe(false);
    expect(document.querySelector('[data-slot="field"]')?.hasAttribute("data-disabled")).toBe(true);
  });

  test("the invalid box is announced as invalid and its field is marked", () => {
    render(() => <CheckboxInvalid />);
    expect(box("checkbox-invalid-terms").getAttribute("aria-invalid")).toBe("true");
    expect(document.querySelector('span[data-slot="checkbox"]')?.hasAttribute("data-invalid")).toBe(
      true,
    );
    expect(document.querySelector('[data-slot="field"]')?.hasAttribute("data-invalid")).toBe(true);
  });

  test("the indeterminate box is announced as mixed", () => {
    render(() => <CheckboxStates />);
    expect(box("checkbox-states-mixed").getAttribute("aria-checked")).toBe("mixed");
    expect(box("checkbox-states-mixed").indeterminate).toBe(true);
  });

  test("the header box selects every row and a row's box selects its row", async () => {
    render(() => <CheckboxTable />);
    const selected = (): number => document.querySelectorAll('tr[data-state="selected"]').length;
    expect(boxes().map((one) => one.checked)).toEqual([false, true, false, false, false]);
    expect(selected()).toBe(1);

    await user.click(box("checkbox-table-row-2"));
    flush();
    expect(selected()).toBe(2);
    expect(box("checkbox-table-select-all").checked).toBe(false);

    await user.click(box("checkbox-table-select-all"));
    flush();
    expect(boxes().every((one) => one.checked)).toBe(true);
    expect(selected()).toBe(4);

    await user.click(box("checkbox-table-select-all"));
    flush();
    expect(boxes().some((one) => one.checked)).toBe(false);
    expect(selected()).toBe(0);
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <CheckboxRtl />);
    expect(document.querySelectorAll('[dir="rtl"] span[data-slot="checkbox"]')).toHaveLength(4);
  });
});
