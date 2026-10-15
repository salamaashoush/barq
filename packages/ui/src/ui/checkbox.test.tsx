import { afterEach, describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import {
  accessibleName,
  cleanup,
  expectNoAriaViolations,
  render,
  screen,
  user,
} from "@barqjs/testing";

import { Checkbox } from "./checkbox.tsx";
import { Field, FieldLabel, FieldTitle } from "./field.tsx";
import { Label } from "./label.tsx";

afterEach(cleanup);

const slot = (name: string): HTMLElement =>
  document.querySelector(`label[data-slot="${name}"], span[data-slot="${name}"]`) as HTMLElement;

describe("Checkbox", () => {
  test("the box and its indicator say checked or unchecked", async () => {
    render(() => <Checkbox aria-label="Accept" />);
    expect(slot("checkbox").getAttribute("data-state")).toBe("unchecked");
    expect(slot("checkbox-indicator").getAttribute("data-state")).toBe("unchecked");
    await user.click(screen.getByRole("checkbox"));
    flush();
    expect(slot("checkbox").getAttribute("data-state")).toBe("checked");
    expect(slot("checkbox-indicator").getAttribute("data-state")).toBe("checked");
  });

  test("defaultChecked starts it ticked and onCheckedChange hears it cleared", async () => {
    const seen: boolean[] = [];
    render(() => (
      <Checkbox aria-label="Accept" defaultChecked onCheckedChange={(on) => seen.push(on)} />
    ));
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(true);
    await user.click(box);
    flush();
    expect(seen).toEqual([false]);
  });

  test("checked is the owner's to change, and may be indeterminate", async () => {
    const [value, setValue] = createSignal<boolean | "indeterminate">("indeterminate");
    const asked: boolean[] = [];
    render(() => (
      <Checkbox aria-label="All" checked={value()} onCheckedChange={(next) => asked.push(next)} />
    ));
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(slot("checkbox").getAttribute("data-state")).toBe("indeterminate");
    expect(slot("checkbox-indicator").getAttribute("data-state")).toBe("indeterminate");
    expect(box.indeterminate).toBe(true);
    // A dash rather than a tick.
    expect(slot("checkbox-indicator").querySelector("path")?.getAttribute("d")).toBe("M5 12h14");

    await user.click(box);
    flush();
    expect(asked).toEqual([true]);
    expect(slot("checkbox").getAttribute("data-state")).toBe("indeterminate");

    setValue(true);
    flush();
    expect(slot("checkbox").getAttribute("data-state")).toBe("checked");
    expect(box.indeterminate).toBe(false);
  });

  test("disabled reaches the input and marks the box and its indicator", () => {
    render(() => <Checkbox aria-label="Accept" disabled />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(slot("checkbox").getAttribute("data-disabled")).toBe("");
    expect(slot("checkbox-indicator").getAttribute("data-disabled")).toBe("");
  });

  test("required reaches the input", () => {
    render(() => <Checkbox aria-label="Terms" required />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.required).toBe(true);
  });
});

describe("Checkbox, as the bare control upstream renders", () => {
  const box = (): HTMLInputElement => screen.getByRole("checkbox") as HTMLInputElement;

  test("it renders no label of its own", () => {
    render(() => <Checkbox aria-label="Accept" />);
    expect(slot("checkbox").tagName).toBe("SPAN");
    expect(document.querySelectorAll("label")).toHaveLength(0);
    expect(slot("checkbox").contains(slot("checkbox-indicator"))).toBe(true);
  });

  test("a press on the box toggles it once and takes focus", async () => {
    const seen: boolean[] = [];
    render(() => <Checkbox aria-label="Accept" onCheckedChange={(on) => seen.push(on)} />);
    await user.click(slot("checkbox"));
    flush();
    expect(seen).toEqual([true]);
    expect(box().checked).toBe(true);
    expect(document.activeElement).toBe(box());
  });

  test("a Label beside it names it and toggles it", async () => {
    const seen: boolean[] = [];
    const { container } = render(() => (
      <>
        <Checkbox id="terms" onCheckedChange={(on) => seen.push(on)} />
        <Label for="terms">Accept the terms</Label>
      </>
    ));
    expect(accessibleName(box())).toBe("Accept the terms");
    expect(container.querySelectorAll("label")).toHaveLength(1);
    await user.click(container.querySelector("label") as HTMLElement);
    flush();
    expect(seen).toEqual([true]);
    expectNoAriaViolations(container);
  });

  test("inside a FieldLabel it nests no label, and a press anywhere toggles once", async () => {
    const seen: boolean[] = [];
    const { container } = render(() => (
      <FieldLabel>
        <Field orientation="horizontal">
          <Checkbox onCheckedChange={(on) => seen.push(on)} />
          <FieldTitle>Accept the terms</FieldTitle>
        </Field>
      </FieldLabel>
    ));
    expect(container.querySelectorAll("label")).toHaveLength(1);
    expect(container.querySelectorAll("label label")).toHaveLength(0);
    expect(accessibleName(box())).toBe("Accept the terms");
    expectNoAriaViolations(container);

    await user.click(slot("checkbox"));
    flush();
    expect(seen).toEqual([true]);

    await user.click(container.querySelector('[data-slot="field-title"]') as HTMLElement);
    flush();
    expect(seen).toEqual([true, false]);
  });
});
