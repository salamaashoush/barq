import { describe, expect, test } from "bun:test";
import { flush, signal } from "@barqjs/core";
import {
  accessibleDescription,
  expectNoAriaViolations,
  render,
  screen,
  user,
} from "@barqjs/testing";
import { Button } from "./button.tsx";
import { Checkbox, CheckboxGroup, GroupCheckbox } from "./checkbox.tsx";
import type { Key } from "./collections.ts";
import type { Color } from "./color.ts";
import { ColorField } from "./colorpicker.tsx";
import { ComboBox } from "./combobox.tsx";
import { CalendarDate, type DateValue } from "./date.ts";
import { DateField } from "./datefield.tsx";
import { Option } from "./listbox.tsx";
import { NumberField } from "./numberfield.tsx";
import { Radio, RadioGroup } from "./radio.tsx";
import { Select } from "./select.tsx";
import { Switch } from "./switch.tsx";
import { Form } from "./form.tsx";
import { TextField } from "./textfield.tsx";
import type { ValidationErrors } from "./validation.ts";

function field(): HTMLInputElement {
  return screen.getByRole("textbox") as HTMLInputElement;
}

function type(text: string): void {
  const element = field();
  user.focus(element);
  element.value = text;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  flush();
}

describe("aria validation", () => {
  test("a valid field says nothing", () => {
    render(() => (
      <TextField
        label="Email"
        validate={(value: string) => (value.includes("@") ? null : "Not an email address")}
        defaultValue="me@example.com"
      />
    ));

    expect(field().hasAttribute("aria-invalid")).toBe(false);
    expect(accessibleDescription(field())).toBe("");
  });

  test("an invalid one is marked and described by the message", () => {
    render(() => (
      <TextField
        label="Email"
        defaultValue="nope"
        validate={(value: string) => (value.includes("@") ? null : "Not an email address")}
      />
    ));

    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(field())).toBe("Not an email address");
  });

  test("the message follows the value as it is typed", () => {
    render(() => (
      <TextField
        label="Email"
        defaultValue="nope"
        validate={(value: string) => (value.includes("@") ? null : "Not an email address")}
      />
    ));

    expect(field().getAttribute("aria-invalid")).toBe("true");

    type("me@example.com");
    expect(field().hasAttribute("aria-invalid")).toBe(false);
  });

  test("more than one message is announced together", () => {
    render(() => (
      <TextField
        label="Password"
        defaultValue="abc"
        validate={(value: string) => (value.length < 8 ? ["Too short", "Needs a number"] : null)}
      />
    ));

    expect(accessibleDescription(field())).toBe("Too short Needs a number");
  });

  test("the caller's own errorMessage wins over what was found", () => {
    render(() => (
      <TextField
        label="Email"
        defaultValue="nope"
        errorMessage="Please use your work address"
        validate={(value: string) => (value.includes("@") ? null : "Not an email address")}
      />
    ));

    expect(accessibleDescription(field())).toBe("Please use your work address");
  });

  test("isInvalid on its own still marks the field", () => {
    render(() => <TextField label="Email" isInvalid errorMessage="Something is wrong" />);

    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(field())).toBe("Something is wrong");
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => (
      <TextField
        label="Email"
        defaultValue="nope"
        validate={(value: string) => (value.includes("@") ? null : "Not an email address")}
      />
    ));
    expectNoAriaViolations(container);
  });
});

describe("native validation", () => {
  test("the browser's own constraint is what fails", () => {
    render(() => (
      <Form aria-label="Account" validationBehavior="native">
        <TextField label="Email" name="email" isRequired />
      </Form>
    ));

    // `required` is on the element, so the browser refuses the submit.
    expect(field().required).toBe(true);
    expect(field().checkValidity()).toBe(false);
  });

  test("nothing is shown until the form is submitted", () => {
    render(() => (
      <Form aria-label="Account" validationBehavior="native">
        <TextField
          label="Email"
          name="email"
          validate={(value: string) => (value.includes("@") ? null : "Not an email address")}
        />
      </Form>
    ));

    // Errors typed AT are errors nobody has finished making yet.
    expect(field().hasAttribute("aria-invalid")).toBe(false);

    // What a submit does first: the browser checks every control, and each
    // invalid one gets an `invalid` event, which is what commits the message.
    const form = screen.getByRole("form", { name: "Account" }) as HTMLFormElement;
    form.checkValidity();
    flush();

    expect(field().getAttribute("aria-invalid")).toBe("true");
  });

  test("the page's own error is put onto the element, so the browser blocks", () => {
    render(() => (
      <Form aria-label="Account" validationBehavior="native">
        <TextField
          label="Email"
          name="email"
          defaultValue="nope"
          validate={(value: string) => (value.includes("@") ? null : "Not an email address")}
        />
      </Form>
    ));
    flush();

    expect(field().validity.customError).toBe(true);
    expect(field().validationMessage).toBe("Not an email address");
    expect(field().checkValidity()).toBe(false);
  });

  test("a valid value clears what was put on the element", () => {
    render(() => (
      <Form aria-label="Account" validationBehavior="native">
        <TextField
          label="Email"
          name="email"
          defaultValue="nope"
          validate={(value: string) => (value.includes("@") ? null : "Not an email address")}
        />
      </Form>
    ));
    flush();
    expect(field().checkValidity()).toBe(false);

    type("me@example.com");
    expect(field().validationMessage).toBe("");
    expect(field().checkValidity()).toBe(true);
  });

  test("the browser's error bubble is suppressed", () => {
    render(() => (
      <Form aria-label="Account" validationBehavior="native">
        <TextField label="Email" name="email" isRequired />
      </Form>
    ));

    // Prevented, so the message goes into the page where it stays.
    const event = new Event("invalid", { bubbles: false, cancelable: true });
    field().dispatchEvent(event);
    flush();
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("server errors", () => {
  test("a form hands each message to the field it names", () => {
    render(() => (
      <Form aria-label="Account" validationErrors={{ email: "That address is already taken" }}>
        <TextField label="Email" name="email" defaultValue="me@example.com" />
      </Form>
    ));

    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(field())).toBe("That address is already taken");
  });

  test("a field with no matching name is untouched", () => {
    render(() => (
      <Form aria-label="Account" validationErrors={{ other: "Something else" }}>
        <TextField label="Email" name="email" defaultValue="me@example.com" />
      </Form>
    ));

    expect(field().hasAttribute("aria-invalid")).toBe(false);
  });

  test("editing the value clears it", () => {
    render(() => (
      <Form aria-label="Account" validationErrors={{ email: "That address is already taken" }}>
        <TextField label="Email" name="email" defaultValue="me@example.com" />
      </Form>
    ));

    expect(field().getAttribute("aria-invalid")).toBe("true");

    // The user has invalidated whatever the server said about the old value.
    type("someone@example.com");
    user.blur(field());
    flush();

    expect(field().hasAttribute("aria-invalid")).toBe(false);
  });

  test("a new set of errors is shown again", () => {
    const errors = signal<ValidationErrors>({});
    render(() => (
      <Form aria-label="Account" validationErrors={errors()}>
        <TextField label="Email" name="email" defaultValue="me@example.com" />
      </Form>
    ));

    expect(field().hasAttribute("aria-invalid")).toBe(false);

    errors.set({ email: "That address is already taken" });
    flush();

    expect(field().getAttribute("aria-invalid")).toBe("true");
  });
});

describe("Form", () => {
  test("hands the submit handler the values, and does not also navigate", () => {
    const submitted: string[] = [];
    render(() => (
      <Form aria-label="Account" onSubmit={(data) => submitted.push(String(data.get("email")))}>
        <TextField label="Email" name="email" defaultValue="me@example.com" />
        <Button type="submit">Save</Button>
      </Form>
    ));

    const form = screen.getByRole("form", { name: "Account" }) as HTMLFormElement;
    const event = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    flush();

    expect(submitted).toEqual(["me@example.com"]);
    expect(event.defaultPrevented).toBe(true);
  });

  test("one behaviour applies to everything inside", () => {
    render(() => (
      <Form aria-label="Account" validationBehavior="native">
        <TextField
          label="Email"
          name="email"
          validate={(value: string) => (value === "" ? "Bad" : null)}
        />
      </Form>
    ));
    flush();

    // Inherited, not set on the field: half a form validating natively is
    // half a form that blocks submission.
    expect(field().validity.customError).toBe(true);
  });

  test("a reset clears what is being shown", () => {
    render(() => (
      <Form aria-label="Account" validationBehavior="native">
        <TextField
          label="Email"
          name="email"
          defaultValue="nope"
          validate={(value: string) => (value === "" ? "Bad" : null)}
        />
      </Form>
    ));

    const form = screen.getByRole("form", { name: "Account" }) as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    flush();

    form.dispatchEvent(new Event("reset", { bubbles: true }));
    flush();

    expect(field().hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("a checkbox validates", () => {
  test("validate marks the box invalid", () => {
    render(() => (
      <Checkbox validate={(on: boolean) => (on ? null : "You have to agree")}>I agree</Checkbox>
    ));

    const box = screen.getByRole("checkbox");
    expect(box.getAttribute("aria-invalid")).toBe("true");

    user.click(box);
    flush();

    expect(box.hasAttribute("aria-invalid")).toBe(false);
  });

  test("isInvalid from the caller still wins", () => {
    render(() => <Checkbox isInvalid>I agree</Checkbox>);
    expect(screen.getByRole("checkbox").getAttribute("aria-invalid")).toBe("true");
  });

  test("the label carries data-invalid", () => {
    render(() => (
      <Checkbox validate={(on: boolean) => (on ? null : "You have to agree")}>I agree</Checkbox>
    ));
    expect(screen.getByRole("checkbox").closest("label")?.hasAttribute("data-invalid")).toBe(true);
  });
});

describe("a switch validates", () => {
  test("validate marks it invalid and clears when satisfied", () => {
    render(() => (
      <Switch validate={(on: boolean) => (on ? null : "Turn this on")}>Notifications</Switch>
    ));

    const control = screen.getByRole("switch");
    expect(control.getAttribute("aria-invalid")).toBe("true");

    user.click(control);
    flush();

    expect(control.hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("every field validates", () => {
  test("a checkbox group", () => {
    render(() => (
      <CheckboxGroup
        label="Toppings"
        validate={(picked: string[]) => (picked.length === 0 ? "Pick at least one" : null)}
      >
        <GroupCheckbox value="cheese">Cheese</GroupCheckbox>
        <GroupCheckbox value="olives">Olives</GroupCheckbox>
      </CheckboxGroup>
    ));

    const group = screen.getByRole("group");
    expect(group.getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(group)).toBe("Pick at least one");

    user.click(screen.getByRole("checkbox", { name: "Cheese" }));
    flush();

    expect(group.hasAttribute("aria-invalid")).toBe(false);
  });

  test("a radio group", () => {
    render(() => (
      <RadioGroup
        label="Size"
        defaultValue="s"
        validate={(value: string | null) => (value === "s" ? "Too small" : null)}
      >
        <Radio value="s">Small</Radio>
        <Radio value="m">Medium</Radio>
      </RadioGroup>
    ));

    const group = screen.getByRole("radiogroup");
    expect(group.getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(group)).toBe("Too small");

    user.click(screen.getByRole("radio", { name: "Medium" }));
    flush();

    expect(group.hasAttribute("aria-invalid")).toBe(false);
  });

  test("a select", () => {
    render(() => (
      <Select
        label="Fruit"
        items={[{ id: "apple", name: "Apple" }]}
        defaultSelectedKey="apple"
        validate={(key: Key | Key[] | null) => (key === "apple" ? "Not apples" : null)}
        getTextValue={(fruit: { name: string }) => fruit.name}
      >
        {(fruit: { name: string }) => <Option>{fruit.name}</Option>}
      </Select>
    ));

    const trigger = screen.getByRole("button");
    expect(trigger.getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(trigger)).toBe("Not apples");
  });

  test("a combo box", () => {
    render(() => (
      <ComboBox
        label="Fruit"
        items={[{ id: "apple", name: "Apple" }]}
        defaultSelectedKey="apple"
        validate={(key: Key | null) => (key === "apple" ? "Not apples" : null)}
        getTextValue={(fruit: { name: string }) => fruit.name}
      >
        {(fruit: { name: string }) => <Option>{fruit.name}</Option>}
      </ComboBox>
    ));

    const input = screen.getByRole("combobox");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(input)).toBe("Not apples");
  });

  test("a number field, on the NUMBER and not the typed text", () => {
    render(() => (
      <NumberField
        label="Quantity"
        defaultValue={0}
        validate={(value: number) => (value > 0 ? null : "At least one")}
      />
    ));

    const input = screen.getByRole("textbox");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(input)).toBe("At least one");
  });

  test("a date field", () => {
    render(() => (
      <DateField
        label="Departure"
        defaultValue={new CalendarDate(2026, 1, 1)}
        validate={(value: DateValue | null) => (value?.year === 2026 ? "Too soon" : null)}
      />
    ));

    const group = screen.getByRole("group");
    expect(group.getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(group)).toBe("Too soon");
  });

  test("a colour field, on the COLOUR and not the typed text", () => {
    render(() => (
      <ColorField
        label="Brand"
        defaultValue="#000000"
        validate={(value: Color) => (value.toString("hex") === "#000000" ? "Not black" : null)}
      />
    ));

    const input = screen.getByRole("textbox");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(input)).toBe("Not black");
  });
});

describe("a select validates NATIVELY, not only in aria", () => {
  const FRUITS = [{ id: "apple", name: "Apple" }];

  function hidden(): HTMLSelectElement {
    return document.querySelector("select") as HTMLSelectElement;
  }

  test("the page's message reaches the hidden control the browser checks", () => {
    render(() => (
      <Select
        label="Fruit"
        name="fruit"
        items={FRUITS}
        defaultSelectedKey="apple"
        validationBehavior="native"
        validate={(key: Key | Key[] | null) => (key === "apple" ? "Not apples" : null)}
        getTextValue={(fruit: { name: string }) => fruit.name}
      >
        {(fruit: { name: string }) => <Option>{fruit.name}</Option>}
      </Select>
    ));
    flush();

    // Without this the browser accepts a submit the page has already rejected:
    // `aria-invalid` says so to a screen reader and to nothing else.
    expect(hidden().validationMessage).toBe("Not apples");
    expect(hidden().checkValidity()).toBe(false);
  });

  test("a valid choice leaves the control valid", () => {
    render(() => (
      <Select
        label="Fruit"
        name="fruit"
        items={FRUITS}
        defaultSelectedKey="apple"
        validationBehavior="native"
        validate={(_key: Key | Key[] | null) => null}
        getTextValue={(fruit: { name: string }) => fruit.name}
      >
        {(fruit: { name: string }) => <Option>{fruit.name}</Option>}
      </Select>
    ));
    flush();

    expect(hidden().validationMessage).toBe("");
  });

  // NOT TESTED HERE: that a refused submit focuses the visible button rather
  // than the clipped `<select>`. `formValidation` finds the first invalid
  // control with `form.querySelector(":invalid")`, and happy-dom does not
  // support that selector — it matches nothing, so no field is focused at all.
  // The wiring is `hiddenSelect`'s `focus: () => triggerRef.focus()`, and the
  // reason it exists is that focusing a clipped element looks to the user like
  // the submit did nothing.
});
