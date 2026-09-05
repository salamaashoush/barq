/**
 * `<Label for="x">` against every control that takes an `id`.
 *
 * This is the shape shadcn writes and the shape `@barqjs/ui`'s own docs show:
 * a label somewhere else on the page, joined to the control by an id rather
 * than by nesting it. It is also the shape none of the 736 tests in this
 * package covered, and three components got it wrong the same way.
 *
 * The rule is the HTML specification's, not a preference. `for` may only
 * address a LABELABLE element — button, input, meter, output, progress, select,
 * textarea — and it resolves to the first element with that id in tree order.
 * A checkbox, a switch and a radio here are each a `<label>` wrapping a hidden
 * `<input>`, which is React Aria's shape, and `id` reached BOTH. The wrapper
 * comes first, so the association landed on a `<label>`, which is not labelable
 * at all: clicking the text toggled nothing, in a real browser, silently.
 *
 * Two assertions per control, and both are needed. The count catches the
 * duplicate; `label.control` catches the association, which is the thing a
 * person actually experiences.
 */

import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";
import { Checkbox } from "./checkbox.tsx";
import { Radio, RadioGroup } from "./radio.tsx";
import { Switch } from "./switch.tsx";

/** The elements `for` is allowed to address. */
const LABELABLE = new Set(["BUTTON", "INPUT", "METER", "OUTPUT", "PROGRESS", "SELECT", "TEXTAREA"]);

function expectAddressable(id: string, role: string): void {
  const control = screen.getByRole(role);
  expect(document.querySelectorAll(`#${id}`)).toHaveLength(1);
  expect(control.id).toBe(id);
  expect(LABELABLE.has(control.tagName)).toBe(true);
  const label = document.querySelector(`label[for="${id}"]`) as HTMLLabelElement;
  expect(label.control).toBe(control);
}

describe("a label elsewhere on the page reaches the control by id", () => {
  test("Checkbox", () => {
    render(() => (
      <>
        <label for="terms">Accept the terms</label>
        <Checkbox id="terms" />
      </>
    ));
    expectAddressable("terms", "checkbox");
  });

  test("Switch", () => {
    render(() => (
      <>
        <label for="wifi">Wi-Fi</label>
        <Switch id="wifi" />
      </>
    ));
    expectAddressable("wifi", "switch");
  });

  test("Radio", () => {
    render(() => (
      <RadioGroup label="Size">
        <label for="size-m">Medium</label>
        <Radio id="size-m" value="m" />
      </RadioGroup>
    ));
    expectAddressable("size-m", "radio");
  });
});
