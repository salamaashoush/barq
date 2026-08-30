import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import { NumberField } from "./numberfield.tsx";

function Quantity(
  props: Incoming<{
    defaultValue?: number | null;
    minValue?: number;
    maxValue?: number;
    step?: number;
    formatOptions?: Intl.NumberFormatOptions;
    isDisabled?: boolean;
    onChange?: (value: number) => void;
  }>,
) {
  return (
    <NumberField
      label="Quantity"
      defaultValue={props.defaultValue?.()}
      minValue={props.minValue?.()}
      maxValue={props.maxValue?.()}
      step={props.step?.()}
      formatOptions={props.formatOptions?.()}
      isDisabled={props.isDisabled?.()}
      onChange={props.onChange?.()}
    />
  );
}

function field(): HTMLInputElement {
  return screen.getByRole("textbox") as HTMLInputElement;
}

/** Type into the field the way a browser does: focus it, then the value. */
function type(text: string): void {
  const element = field();
  user.focus(element);
  element.value = text;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  flush();
}

describe("NumberField", () => {
  test("is a named text field, not a number input", () => {
    render(() => <Quantity defaultValue={5} />);

    expect(accessibleName(field())).toBe("Quantity");
    // `type="number"` would accept "1e5" and refuse a currency symbol.
    expect(field().type).toBe("text");
    expect(field().value).toBe("5");
  });

  test("the steppers are out of the Tab order", () => {
    render(() => <Quantity defaultValue={5} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button.getAttribute("tabindex")).toBe("-1");
    }
  });

  test("the steppers say what they do", () => {
    render(() => <Quantity defaultValue={5} />);

    expect(screen.getByRole("button", { name: "Increase Quantity" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Decrease Quantity" })).not.toBeNull();
  });

  test("the arrows step the value", () => {
    const changes: number[] = [];
    render(() => <Quantity defaultValue={5} onChange={(value) => changes.push(value)} />);

    user.focus(field());
    user.keyDown("ArrowUp");
    flush();
    expect(field().value).toBe("6");

    user.keyDown("ArrowDown");
    flush();
    expect(field().value).toBe("5");

    expect(changes).toEqual([6, 5]);
  });

  test("pressing a stepper steps the value", () => {
    render(() => <Quantity defaultValue={5} />);

    user.click(screen.getByRole("button", { name: "Increase Quantity" }));
    flush();

    expect(field().value).toBe("6");
  });

  test("a step of its own is what the arrows move by", () => {
    render(() => <Quantity defaultValue={0} step={5} />);

    user.focus(field());
    user.keyDown("ArrowUp");
    flush();

    expect(field().value).toBe("5");
  });

  test("a value off the step lands ON the step first", () => {
    render(() => <Quantity defaultValue={0} step={10} />);

    type("13");
    user.keyDown("ArrowUp");
    flush();

    // Not 23: the user asked for the next valid value.
    expect(field().value).toBe("20");
  });

  test("Home and End go to the ends", () => {
    render(() => <Quantity defaultValue={5} minValue={0} maxValue={10} />);

    user.focus(field());
    user.keyDown("End");
    flush();
    expect(field().value).toBe("10");

    user.keyDown("Home");
    flush();
    expect(field().value).toBe("0");
  });

  test("the steppers stop at the ends", () => {
    render(() => <Quantity defaultValue={10} minValue={0} maxValue={10} />);

    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Increase Quantity" }).disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Decrease Quantity" }).disabled,
    ).toBe(false);
  });

  test("a keystroke that cannot become a number is refused", () => {
    render(() => <Quantity defaultValue={5} />);

    type("12x");

    // The field keeps what it had rather than showing something meaningless.
    expect(field().value).toBe("5");
  });

  test("a partial number is accepted as typed", () => {
    render(() => <Quantity defaultValue={0} />);

    type("-");
    expect(field().value).toBe("-");

    type("-1.");
    expect(field().value).toBe("-1.");
  });

  test("blurring commits and formats", () => {
    const changes: number[] = [];
    render(() => (
      <Quantity
        defaultValue={0}
        formatOptions={{ style: "currency", currency: "USD" }}
        onChange={(value) => changes.push(value)}
      />
    ));

    type("1234.5");
    user.blur(field());
    flush();

    expect(field().value).toBe("$1,234.50");
    expect(changes).toEqual([1234.5]);
  });

  test("blurring clamps to the range", () => {
    render(() => <Quantity defaultValue={5} minValue={0} maxValue={10} />);

    type("99");
    user.blur(field());
    flush();

    expect(field().value).toBe("10");
  });

  test("blurring snaps to the step", () => {
    render(() => <Quantity defaultValue={0} step={5} />);

    type("13");
    user.blur(field());
    flush();

    expect(field().value).toBe("15");
  });

  test("emptying the field clears the value", () => {
    const changes: number[] = [];
    render(() => <Quantity defaultValue={5} onChange={(value) => changes.push(value)} />);

    type("");
    user.blur(field());
    flush();

    expect(field().value).toBe("");
    expect(changes.every((value) => Number.isNaN(value))).toBe(true);
  });

  test("a currency value parses back out of what it shows", () => {
    const changes: number[] = [];
    render(() => (
      <Quantity
        defaultValue={12.5}
        formatOptions={{ style: "currency", currency: "USD" }}
        onChange={(value) => changes.push(value)}
      />
    ));

    expect(field().value).toBe("$12.50");

    user.focus(field());
    user.keyDown("ArrowUp");
    flush();

    // Onto the step first: the next value a step of 1 allows above 12.5 is 13.
    expect(field().value).toBe("$13.00");
    expect(changes).toEqual([13]);

    type("$99.99");
    user.blur(field());
    flush();
    expect(field().value).toBe("$99.99");
    expect(changes.at(-1)).toBe(99.99);
  });

  test("a percent field steps by a percentage point", () => {
    render(() => <Quantity defaultValue={0.3} formatOptions={{ style: "percent" }} />);

    expect(field().value).toBe("30%");

    user.focus(field());
    user.keyDown("ArrowUp");
    flush();

    expect(field().value).toBe("31%");
  });

  test("a disabled field does not step", () => {
    const changes: number[] = [];
    render(() => (
      <Quantity defaultValue={5} isDisabled onChange={(value) => changes.push(value)} />
    ));

    expect(field().disabled).toBe(true);

    user.focus(field());
    user.keyDown("ArrowUp");
    flush();

    expect(changes).toEqual([]);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Quantity defaultValue={5} />);
    expectNoAriaViolations(container);
  });
});
