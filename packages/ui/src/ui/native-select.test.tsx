import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "./native-select.tsx";

const wrapperOf = (): HTMLElement =>
  screen.getByTestId("host").querySelector<HTMLElement>('[data-slot="native-select-wrapper"]')!;

const selectOf = (): HTMLSelectElement =>
  screen.getByTestId("host").querySelector<HTMLSelectElement>("select")!;

describe("NativeSelect", () => {
  test("`class` reaches the WRAPPER, which is the box that has a width", () => {
    // The wrapper carries `width: fit-content`. A caller widening the control
    // writes `class`, and while that landed on the `<select>` inside it the
    // wrapper stayed shrink-wrapped and the control never moved — so a select
    // and an input in the same form sized differently.
    render(() => (
      <div data-testid="host">
        <NativeSelect class="w-full">
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      </div>
    ));

    expect(wrapperOf().className).toContain("w-full");
    expect(selectOf().className).not.toContain("w-full");
  });

  test("the wrapper keeps its own classes alongside the caller's", () => {
    render(() => (
      <div data-testid="host">
        <NativeSelect class="w-full">
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      </div>
    ));

    expect(wrapperOf().className.split(/\s+/).length).toBeGreaterThan(1);
  });

  test("everything the label points at stays on the control", () => {
    render(() => (
      <div data-testid="host">
        <NativeSelect id="pick" name="pick" class="w-full" aria-invalid="true">
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      </div>
    ));

    const select = selectOf();
    expect(select.id).toBe("pick");
    expect(select.getAttribute("name")).toBe("pick");
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(wrapperOf().id).toBe("");
  });

  test("the options are the control's children, not the wrapper's", () => {
    render(() => (
      <div data-testid="host">
        <NativeSelect>
          <NativeSelectOption value="a">A</NativeSelectOption>
          <NativeSelectOption value="b">B</NativeSelectOption>
        </NativeSelect>
      </div>
    ));

    expect(selectOf().options.length).toBe(2);
    expect(wrapperOf().querySelectorAll("option").length).toBe(2);
  });

  test("the chevron is the component's own, so the platform's is not drawn twice", () => {
    render(() => (
      <div data-testid="host">
        <NativeSelect>
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      </div>
    ));

    expect(wrapperOf().querySelector('[data-slot="native-select-icon"]')).not.toBe(null);
  });

  test("size is the design system's, and never the platform's row count", () => {
    // `size` on a `<select>` means how many rows to show, and passing "sm"
    // through would turn the control into a listbox.
    render(() => (
      <div data-testid="host">
        <NativeSelect size="sm">
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      </div>
    ));

    expect(selectOf().getAttribute("data-size")).toBe("sm");
    expect(selectOf().hasAttribute("size")).toBe(false);
    expect(rulesFor(selectOf().className)).toContain('[data-size="sm"]');
  });

  test("the default size says so, so a rule can select on it", () => {
    render(() => (
      <div data-testid="host">
        <NativeSelect>
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      </div>
    ));
    expect(selectOf().getAttribute("data-size")).toBe("default");
  });

  test("an option group is a real optgroup with its label, and each part has its slot", () => {
    render(() => (
      <div data-testid="host">
        <NativeSelect>
          <NativeSelectOptGroup label="Engineering">
            <NativeSelectOption value="frontend">Frontend</NativeSelectOption>
            <NativeSelectOption value="backend" disabled>
              Backend
            </NativeSelectOption>
          </NativeSelectOptGroup>
        </NativeSelect>
      </div>
    ));

    const group = selectOf().querySelector("optgroup");
    expect(group?.getAttribute("label")).toBe("Engineering");
    expect(group?.getAttribute("data-slot")).toBe("native-select-optgroup");
    expect(selectOf().getAttribute("data-slot")).toBe("native-select");
    const options = [...selectOf().options];
    expect(options.map((option) => option.getAttribute("data-slot"))).toEqual([
      "native-select-option",
      "native-select-option",
    ]);
    expect(options[1]?.disabled).toBe(true);
  });

  test("a group can be disabled as a whole", () => {
    render(() => (
      <div data-testid="host">
        <NativeSelect>
          <NativeSelectOptGroup label="Archived" disabled>
            <NativeSelectOption value="old">Old</NativeSelectOption>
          </NativeSelectOptGroup>
        </NativeSelect>
      </div>
    ));

    expect(selectOf().querySelector("optgroup")?.disabled).toBe(true);
  });

  test("an option can be the one selected to begin with, and can carry a label", () => {
    render(() => (
      <div data-testid="host">
        <NativeSelect>
          <NativeSelectOption value="a">A</NativeSelectOption>
          <NativeSelectOption value="b" selected label="Bee">
            B
          </NativeSelectOption>
        </NativeSelect>
      </div>
    ));

    expect(selectOf().value).toBe("b");
    expect(selectOf().options[1]?.getAttribute("label")).toBe("Bee");
  });

  test("a disabled control is disabled, and the wrapper's own rule dims it", () => {
    render(() => (
      <div data-testid="host">
        <NativeSelect disabled>
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      </div>
    ));

    expect(selectOf().disabled).toBe(true);
    expect(rulesFor(wrapperOf().className)).toContain("select:disabled");
  });

  test("the rules name inline edges, so a right-to-left page mirrors the chevron", () => {
    render(() => (
      <div data-testid="host">
        <NativeSelect>
          <NativeSelectOption value="a">A</NativeSelectOption>
        </NativeSelect>
      </div>
    ));

    const control = rulesFor(selectOf().className);
    expect(control).toContain("padding-inline-end:");
    expect(control).not.toContain("padding-right:");
    const chevron = wrapperOf().querySelector('[data-slot="native-select-icon"]');
    const rules = rulesFor(chevron?.getAttribute("class") ?? "");
    expect(rules).toContain("inset-inline-end:");
    expect(rules).not.toContain("right:");
  });
});
