import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { NativeSelect, NativeSelectOption } from "./native-select.tsx";

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
});
