import { describe, expect, jest, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import {
  accessibleDescription,
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  user,
} from "@barqjs/testing";
import { Form } from "./form.tsx";
import { destroyAnnouncer } from "./live.ts";
import { NumberField } from "./numberfield.tsx";

function Quantity(props: {
  defaultValue?: number | null;
  minValue?: number;
  maxValue?: number;
  step?: number;
  formatOptions?: Intl.NumberFormatOptions;
  isDisabled?: boolean;
  onChange?: (value: number) => void;
}) {
  return (
    <NumberField
      label="Quantity"
      defaultValue={props.defaultValue}
      minValue={props.minValue}
      maxValue={props.maxValue}
      step={props.step}
      formatOptions={props.formatOptions}
      isDisabled={props.isDisabled}
      onChange={props.onChange}
    />
  );
}

function field(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("textbox");
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

describe("NumberField, in a form", () => {
  test("submits the number, not the text it shows", () => {
    render(() => (
      <Form aria-label="Order">
        <NumberField
          label="Price"
          name="price"
          defaultValue={1234.5}
          formatOptions={{ style: "currency", currency: "USD" }}
        />
      </Form>
    ));
    const form = screen.getByRole<HTMLFormElement>("form");

    expect(field().value).toBe("$1,234.50");
    expect(new FormData(form).getAll("price")).toEqual(["1234.5"]);
  });

  test("an empty field submits an empty value", () => {
    render(() => (
      <Form aria-label="Order">
        <NumberField label="Quantity" name="quantity" />
      </Form>
    ));
    expect(new FormData(screen.getByRole<HTMLFormElement>("form")).get("quantity")).toBe("");
  });

  test("a disabled field submits nothing", () => {
    render(() => (
      <Form aria-label="Order">
        <NumberField label="Quantity" name="quantity" defaultValue={3} isDisabled />
      </Form>
    ));
    expect(new FormData(screen.getByRole<HTMLFormElement>("form")).has("quantity")).toBe(false);
  });

  test("Enter commits before the form reads the value", () => {
    render(() => (
      <Form aria-label="Order">
        <NumberField label="Quantity" name="quantity" minValue={0} maxValue={10} />
      </Form>
    ));
    const form = screen.getByRole<HTMLFormElement>("form");
    type("50");

    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    field().dispatchEvent(enter);

    // What a submit reads, straight after the key: no flush in between.
    expect(field().value).toBe("10");
    expect(new FormData(form).get("quantity")).toBe("10");
    expect(enter.defaultPrevented).toBe(false);
  });

  test("tabbing through without an edit keeps the server's error", () => {
    render(() => (
      <Form aria-label="Order" validationErrors={{ quantity: "Too many" }}>
        <NumberField label="Quantity" name="quantity" defaultValue={3} />
      </Form>
    ));
    expect(field().getAttribute("aria-invalid")).toBe("true");

    user.focus(field());
    user.blur(field());

    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(field())).toBe("Too many");
  });

  test("an edit clears the server's error", () => {
    render(() => (
      <Form aria-label="Order" validationErrors={{ quantity: "Too many" }}>
        <NumberField label="Quantity" name="quantity" defaultValue={3} />
      </Form>
    ));

    type("2");
    user.blur(field());

    expect(field().hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("NumberField, announcing", () => {
  function assertive(): string {
    return (
      document.querySelector("[data-barq-live-announcer] [aria-live=assertive]")?.textContent ?? ""
    );
  }

  test("a value set from elsewhere while the field is not focused is not announced", () => {
    destroyAnnouncer();
    const [value, setValue] = createSignal(1);
    render(() => <NumberField label="Quantity" value={value()} onChange={setValue} />);

    setValue(2);
    flush();
    setValue(3);
    flush();

    expect(field().value).toBe("3");
    expect(assertive()).toBe("");
  });

  test("a step while focused is announced", () => {
    destroyAnnouncer();
    render(() => <Quantity defaultValue={5} />);

    user.focus(field());
    user.keyDown("ArrowUp");
    flush();

    expect(assertive()).toBe("6");
  });
});

describe("NumberField, stepping by touch", () => {
  const touch = {
    bubbles: true,
    cancelable: true,
    pointerId: 7,
    pointerType: "touch",
    button: 0,
    isPrimary: true,
    width: 10,
    height: 10,
    pressure: 0.5,
  };

  test("a tap steps once", () => {
    render(() => <Quantity defaultValue={5} />);

    user.tap(screen.getByRole("button", { name: "Increase Quantity" }));
    flush();

    expect(field().value).toBe("6");
  });

  test("a touch the browser cancels for a scroll does not step", () => {
    render(() => <Quantity defaultValue={5} />);
    const increase = screen.getByRole("button", { name: "Increase Quantity" });

    increase.dispatchEvent(new PointerEvent("pointerdown", touch));
    flush();
    increase.dispatchEvent(new PointerEvent("pointercancel", touch));
    flush();

    expect(field().value).toBe("5");
  });
});

describe("NumberField, holding a stepper", () => {
  test("stops repeating once a step no longer moves the value", () => {
    jest.useFakeTimers();
    try {
      const [max, setMax] = createSignal(10);
      const changes: number[] = [];
      render(() => (
        <Quantity
          defaultValue={3}
          minValue={0}
          maxValue={max()}
          step={3}
          onChange={(value) => changes.push(value)}
        />
      ));
      const increase = screen.getByRole<HTMLButtonElement>("button", { name: "Increase Quantity" });

      // Held and never released: a disabled button may not hear the release.
      user.pointerHold(increase);
      flush();
      for (let tick = 0; tick < 20; tick++) {
        jest.advanceTimersByTime(100);
        flush();
      }

      // 10 is the maximum but 12 is the next step, so the button is disabled.
      expect(field().value).toBe("9");
      expect(increase.disabled).toBe(true);

      // Room again, and the press that was abandoned does not come back to life.
      setMax(100);
      flush();
      for (let tick = 0; tick < 20; tick++) {
        jest.advanceTimersByTime(100);
        flush();
      }

      expect(field().value).toBe("9");
      expect(changes).toEqual([6, 9]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("NumberField, validating rather than snapping", () => {
  test("keeps a value over the maximum and says it is invalid", () => {
    render(() => (
      <NumberField label="Width" minValue={10} maxValue={50} step={10} commitBehavior="validate" />
    ));

    type("1024");
    user.blur(field());

    expect(field().value).toBe("1,024");
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(field())).not.toBe("");
  });

  test("a value on the range and the step is valid", () => {
    render(() => (
      <NumberField label="Width" minValue={10} maxValue={50} step={10} commitBehavior="validate" />
    ));

    type("30");
    user.blur(field());

    expect(field().value).toBe("30");
    expect(field().hasAttribute("aria-invalid")).toBe(false);
  });

  test("off the step is invalid", () => {
    render(() => (
      <NumberField label="Width" minValue={10} maxValue={50} step={10} commitBehavior="validate" />
    ));

    type("31");
    user.blur(field());

    expect(field().value).toBe("31");
    expect(field().getAttribute("aria-invalid")).toBe("true");
  });

  test("blocks a native submit", () => {
    render(() => (
      <Form aria-label="Size" validationBehavior="native">
        <NumberField label="Width" maxValue={50} commitBehavior="validate" />
      </Form>
    ));

    type("80");
    user.blur(field());

    expect(field().checkValidity()).toBe(false);
  });
});

describe("NumberField, as attributes a stylesheet reads", () => {
  test("says read-only and required", () => {
    render(() => <NumberField label="Quantity" isReadOnly isRequired data-testid="group" />);
    const group = screen.getByTestId("group");
    expect(group.hasAttribute("data-readonly")).toBe(true);
    expect(group.hasAttribute("data-required")).toBe(true);
  });
});
