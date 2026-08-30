import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import { Slider } from "./slider.tsx";

function Volume(
  props: Incoming<{
    defaultValue?: number | number[];
    minValue?: number;
    maxValue?: number;
    step?: number;
    isDisabled?: boolean;
    orientation?: "horizontal" | "vertical";
    formatOptions?: Intl.NumberFormatOptions;
    onChange?: (value: number[]) => void;
    onChangeEnd?: (value: number[]) => void;
  }>,
) {
  return (
    <Slider
      label="Volume"
      defaultValue={props.defaultValue?.() ?? 30}
      minValue={props.minValue?.()}
      maxValue={props.maxValue?.()}
      step={props.step?.()}
      isDisabled={props.isDisabled?.()}
      orientation={props.orientation?.()}
      formatOptions={props.formatOptions?.()}
      onChange={props.onChange?.()}
      onChangeEnd={props.onChangeEnd?.()}
    />
  );
}

function thumb(index = 0): HTMLInputElement {
  return screen.getAllByRole("slider")[index] as HTMLInputElement;
}

describe("Slider", () => {
  test("is a group of range inputs named by the label", () => {
    render(() => <Volume />);

    const group = screen.getByRole("group");
    expect(accessibleName(group)).toBe("Volume");
    expect(screen.getAllByRole("slider")).toHaveLength(1);
    expect(thumb().type).toBe("range");
  });

  test("the thumb carries the value and the range it may take", () => {
    render(() => <Volume />);

    expect(thumb().value).toBe("30");
    expect(thumb().min).toBe("0");
    expect(thumb().max).toBe("100");
    expect(thumb().step).toBe("1");
  });

  test("the thumb is announced with the slider's name", () => {
    render(() => <Volume />);
    expect(accessibleName(thumb())).toBe("Volume");
  });

  test("the value is shown as text", () => {
    render(() => <Volume />);
    expect(screen.getByRole("status").textContent).toBe("30");
  });

  test("the value text says what the number means", () => {
    render(() => (
      <Volume formatOptions={{ style: "percent" }} defaultValue={0.3} maxValue={1} step={0.01} />
    ));

    expect(screen.getByRole("status").textContent).toBe("30%");
    expect(thumb().getAttribute("aria-valuetext")).toBe("30%");
  });

  test("typing into the input moves the thumb", () => {
    const changes: number[][] = [];
    render(() => <Volume onChange={(value) => changes.push(value)} />);

    const input = thumb();
    input.value = "55";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();

    expect(changes).toEqual([[55]]);
    expect(input.value).toBe("55");
  });

  test("a value off the step snaps to it", () => {
    const changes: number[][] = [];
    render(() => <Volume step={10} onChange={(value) => changes.push(value)} />);

    const input = thumb();
    input.value = "37";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flush();

    expect(changes).toEqual([[40]]);
  });

  test("Home and End go to the ends", () => {
    render(() => <Volume />);

    user.focus(thumb());
    user.keyDown("End");
    flush();
    expect(thumb().value).toBe("100");

    user.keyDown("Home");
    flush();
    expect(thumb().value).toBe("0");
  });

  test("Page Up and Page Down move a tenth of the range", () => {
    render(() => <Volume />);

    user.focus(thumb());
    user.keyDown("PageUp");
    flush();
    expect(thumb().value).toBe("40");

    user.keyDown("PageDown");
    flush();
    expect(thumb().value).toBe("30");
  });

  test("a keyboard change reports the end of the gesture", () => {
    const ends: number[][] = [];
    render(() => <Volume onChangeEnd={(value) => ends.push(value)} />);

    user.focus(thumb());
    user.keyDown("End");
    flush();

    expect(ends).toEqual([[100]]);
  });

  test("a range has one input per thumb, penned in by its neighbours", () => {
    render(() => <Volume defaultValue={[20, 60]} />);

    const thumbs = screen.getAllByRole("slider");
    expect(thumbs).toHaveLength(2);

    // The lower thumb cannot pass the upper one, and the upper cannot pass the
    // lower: the same gesture must not produce a different value depending on
    // which way the pointer went.
    expect((thumbs[0] as HTMLInputElement).max).toBe("60");
    expect((thumbs[1] as HTMLInputElement).min).toBe("20");
  });

  test("a range shows both values together", () => {
    render(() => <Volume defaultValue={[20, 60]} />);
    expect(screen.getByRole("status").textContent).toBe("20–60");
  });

  test("a vertical slider says so", () => {
    render(() => <Volume orientation="vertical" />);
    expect(thumb().getAttribute("aria-orientation")).toBe("vertical");
  });

  test("a disabled slider cannot be moved", () => {
    const changes: number[][] = [];
    render(() => <Volume isDisabled onChange={(value) => changes.push(value)} />);

    expect(thumb().disabled).toBe(true);

    user.focus(thumb());
    user.keyDown("End");
    flush();

    expect(changes).toEqual([]);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Volume defaultValue={[20, 60]} />);
    expectNoAriaViolations(container);
  });
});
