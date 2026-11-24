import { describe, expect, test } from "bun:test";
import { flush, createSignal } from "@barqjs/core";
import {
  accessibleDescription,
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  user,
} from "@barqjs/testing";
import { Checkbox, CheckboxGroup, GroupCheckbox, useCheckbox } from "./checkbox.tsx";
import { Form } from "./form.tsx";
import { getInteractionModality, isFocusVisible } from "./interactions/modality.ts";

describe("Checkbox", () => {
  test("is a real checkbox with a name from its label", () => {
    render(() => <Checkbox>I agree</Checkbox>);
    const box = screen.getByRole<HTMLInputElement>("checkbox");

    expect(box.tagName).toBe("INPUT");
    expect(box.type).toBe("checkbox");
    expect(accessibleName(box)).toBe("I agree");
  });

  /**
   * A LABEL SOMEWHERE ELSE, which is shadcn's own idiom:
   * `<Label for="terms" />` beside `<Checkbox id="terms" />`, the two joined by
   * the id rather than by nesting.
   *
   * `id` reached both the wrapper `<label>` and the `<input>` inside it, so the
   * document held it twice. `for` may only address a LABELABLE element and
   * resolves to the first match in tree order, which was the wrapper — so the
   * association pointed at a `<label>`, which is not one, and clicking the text
   * toggled nothing. 736 tests passed over it; this is the one that does not.
   */
  test("an id lands on the input, once, so an external label can address it", () => {
    render(() => (
      <>
        <label for="terms">Accept the terms</label>
        <Checkbox id="terms" />
      </>
    ));
    const box = screen.getByRole<HTMLInputElement>("checkbox");
    expect(box.id).toBe("terms");
    expect(document.querySelectorAll("#terms")).toHaveLength(1);
    expect((document.querySelector("label[for=terms]") as HTMLLabelElement).control).toBe(box);
  });

  test("a click on an external label toggles it", async () => {
    const changes: boolean[] = [];
    render(() => (
      <>
        <label for="terms">Accept the terms</label>
        <Checkbox id="terms" onChange={(on) => changes.push(on)} />
      </>
    ));
    await user.click(document.querySelector("label[for=terms]") as HTMLElement);
    expect(changes).toEqual([true]);
  });

  test("a click on the label toggles it", () => {
    const changes: boolean[] = [];
    render(() => <Checkbox onChange={(on) => changes.push(on)}>I agree</Checkbox>);
    const box = screen.getByRole<HTMLInputElement>("checkbox");

    user.click(box.parentElement as HTMLElement);

    expect(changes).toEqual([true]);
    expect(box.checked).toBe(true);
  });

  test("Space toggles it from the keyboard", () => {
    render(() => <Checkbox>I agree</Checkbox>);
    const box = screen.getByRole<HTMLInputElement>("checkbox");

    box.focus();
    // The platform's own activation fires `change`, which is what a real
    // browser does for a focused checkbox.
    box.click();
    flush();

    expect(box.checked).toBe(true);
  });

  test("indeterminate is a property and announces as mixed", () => {
    render(() => <Checkbox isIndeterminate>Some</Checkbox>);
    const box = screen.getByRole<HTMLInputElement>("checkbox");

    expect(box.indeterminate).toBe(true);
    expect(box.getAttribute("aria-checked")).toBe("mixed");
    expect(box.parentElement?.hasAttribute("data-indeterminate")).toBe(true);
  });

  test("disabled does not toggle", () => {
    const changes: boolean[] = [];
    render(() => (
      <Checkbox isDisabled onChange={(on) => changes.push(on)}>
        I agree
      </Checkbox>
    ));
    const box = screen.getByRole<HTMLInputElement>("checkbox");

    expect(box.disabled).toBe(true);
    user.click(box.parentElement as HTMLElement);
    expect(changes).toEqual([]);
  });

  test("read-only shows the value but refuses to change it", () => {
    render(() => (
      <Checkbox isReadOnly defaultSelected>
        I agree
      </Checkbox>
    ));
    const box = screen.getByRole<HTMLInputElement>("checkbox");

    expect(box.getAttribute("aria-readonly")).toBe("true");
    user.click(box.parentElement as HTMLElement);
    expect(box.checked).toBe(true);
  });

  test("controlled: the prop owns the value", () => {
    const [selected, setSelected] = createSignal(false);
    render(() => <Checkbox isSelected={selected()}>I agree</Checkbox>);
    const box = screen.getByRole<HTMLInputElement>("checkbox");

    user.click(box.parentElement as HTMLElement);
    expect(box.checked).toBe(false);

    setSelected(true);
    flush();
    expect(box.checked).toBe(true);
  });

  test("participates in a form", () => {
    render(() => (
      <form data-testid="form">
        <Checkbox name="agree" value="yes" defaultSelected>
          I agree
        </Checkbox>
      </form>
    ));

    const form = screen.getByTestId<HTMLFormElement>("form");
    expect(new FormData(form).get("agree")).toBe("yes");
  });

  test("a form reset returns it to its default", () => {
    render(() => (
      <form data-testid="form">
        <Checkbox name="agree" defaultSelected>
          I agree
        </Checkbox>
      </form>
    ));

    const box = screen.getByRole<HTMLInputElement>("checkbox");
    user.click(box.parentElement as HTMLElement);
    expect(box.checked).toBe(false);

    screen
      .getByTestId<HTMLFormElement>("form")
      .dispatchEvent(new Event("reset", { bubbles: true }));
    flush();

    expect(box.checked).toBe(true);
  });
});

describe("CheckboxGroup", () => {
  function Group() {
    return (
      <CheckboxGroup label="Toppings" data-testid="group">
        <GroupCheckbox value="cheese">Cheese</GroupCheckbox>
        <GroupCheckbox value="olives">Olives</GroupCheckbox>
      </CheckboxGroup>
    );
  }

  test("is a group named by its label", () => {
    render(() => <Group />);
    const group = screen.getByRole("group");
    expect(accessibleName(group)).toBe("Toppings");
  });

  test("selection is the group's, as an array", () => {
    const values: string[][] = [];
    render(() => (
      <CheckboxGroup label="Toppings" onChange={(v) => values.push(v)}>
        <GroupCheckbox value="cheese">Cheese</GroupCheckbox>
        <GroupCheckbox value="olives">Olives</GroupCheckbox>
      </CheckboxGroup>
    ));

    const [cheese, olives] = screen.getAllByRole<HTMLInputElement>("checkbox");

    user.click((cheese as HTMLInputElement).parentElement as HTMLElement);
    user.click((olives as HTMLInputElement).parentElement as HTMLElement);
    user.click((cheese as HTMLInputElement).parentElement as HTMLElement);

    expect(values).toEqual([["cheese"], ["cheese", "olives"], ["olives"]]);
  });

  test("disabling the group disables every member", () => {
    render(() => (
      <CheckboxGroup label="Toppings" isDisabled>
        <GroupCheckbox value="cheese">Cheese</GroupCheckbox>
      </CheckboxGroup>
    ));

    expect(screen.getByRole<HTMLInputElement>("checkbox").disabled).toBe(true);
  });

  test("the description is announced with the group", () => {
    render(() => (
      <CheckboxGroup label="Toppings" description="Pick as many as you like">
        <GroupCheckbox value="cheese">Cheese</GroupCheckbox>
      </CheckboxGroup>
    ));

    const group = screen.getByRole("group");
    const describedBy = group.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy as string)?.textContent).toBe(
      "Pick as many as you like",
    );
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Group />);
    expectNoAriaViolations(container);
  });
});

describe("Checkbox, as an attribute a stylesheet reads", () => {
  function Tick() {
    const box = useCheckbox();
    return (
      <span
        data-testid="tick"
        data-state={() =>
          box.isIndeterminate() ? "indeterminate" : box.isSelected() ? "checked" : "unchecked"
        }
        data-disabled={() => (box.isDisabled() ? "" : undefined)}
      />
    );
  }

  test("says checked, unchecked or indeterminate, beside data-selected", () => {
    const [mixed, setMixed] = createSignal(true);
    render(() => <Checkbox isIndeterminate={mixed()}>All</Checkbox>);
    const label = screen.getByRole("checkbox").parentElement as HTMLElement;
    expect(label.getAttribute("data-state")).toBe("indeterminate");

    setMixed(false);
    flush();
    expect(label.getAttribute("data-state")).toBe("unchecked");

    user.click(screen.getByRole("checkbox"));
    flush();
    expect(label.getAttribute("data-state")).toBe("checked");
  });

  test("a part drawn inside it reads the same state", () => {
    render(() => (
      <Checkbox aria-label="Accept" isDisabled defaultSelected>
        <Tick />
      </Checkbox>
    ));
    expect(screen.getByTestId("tick").getAttribute("data-state")).toBe("checked");
    expect(screen.getByTestId("tick").getAttribute("data-disabled")).toBe("");
  });

  test("a part outside a checkbox says what is wrong", () => {
    expect(() => render(() => <Tick />)).toThrow("inside a Checkbox");
  });
});

interface InALabelProps {
  onChange?: (on: boolean) => void;
}

describe("Checkbox, with nothing of its own to say", () => {
  function box(): HTMLInputElement {
    return screen.getByRole<HTMLInputElement>("checkbox");
  }

  test("with label content it is the label", () => {
    render(() => <Checkbox>I agree</Checkbox>);
    expect(box().parentElement?.tagName).toBe("LABEL");
    expect(accessibleName(box())).toBe("I agree");
  });

  test("without any it renders no label, so it can sit inside one", () => {
    render(() => <Checkbox aria-label="I agree" />);
    expect(box().parentElement?.tagName).toBe("SPAN");
    expect(document.querySelectorAll("label")).toHaveLength(0);
  });

  test("children that are a drawing can ask for the bare form", () => {
    render(() => (
      <Checkbox aria-label="I agree" elementType="span">
        <i data-testid="tick" />
      </Checkbox>
    ));
    expect(box().parentElement?.tagName).toBe("SPAN");
    expect(screen.getByTestId("tick").parentElement).toBe(box().parentElement);
  });

  test("on its own, a press on its body toggles it once and takes focus", () => {
    const changes: boolean[] = [];
    render(() => <Checkbox aria-label="I agree" onChange={(on) => changes.push(on)} />);
    user.click(box().parentElement as HTMLElement);
    flush();
    expect(changes).toEqual([true]);
    expect(box().checked).toBe(true);
    expect(document.activeElement).toBe(box());
    expect(box().parentElement?.getAttribute("data-state")).toBe("checked");
  });

  test("a mouse press on its body is still a mouse press to whatever asks", () => {
    render(() => <Checkbox aria-label="I agree" />);
    user.click(box().parentElement as HTMLElement);
    flush();
    // The body hands the press on to the input. Handed on as `input.click()`
    // it is the click a screen reader makes, and the page then draws a focus
    // ring for someone holding a mouse.
    expect(getInteractionModality()).toBe("pointer");
    expect(isFocusVisible()).toBe(false);
  });

  test("a disabled one ignores a press on its body", () => {
    const changes: boolean[] = [];
    render(() => <Checkbox aria-label="I agree" isDisabled onChange={(on) => changes.push(on)} />);
    user.click(box().parentElement as HTMLElement);
    flush();
    expect(changes).toEqual([]);
    expect(box().checked).toBe(false);
  });

  function InALabel(props: InALabelProps) {
    return (
      <label>
        <span data-testid="text">I agree</span>
        <Checkbox onChange={props.onChange} />
      </label>
    );
  }

  test("inside a caller's label there is one label, and it names the checkbox", () => {
    const { container } = render(() => <InALabel />);
    expect(document.querySelectorAll("label")).toHaveLength(1);
    expect(accessibleName(box())).toBe("I agree");
    expectNoAriaViolations(container);
  });

  test("a press on the label's text toggles it once", () => {
    const changes: boolean[] = [];
    render(() => <InALabel onChange={(on) => changes.push(on)} />);
    user.click(screen.getByTestId("text"));
    flush();
    expect(changes).toEqual([true]);
  });

  test("a press on its own body inside the label toggles it once, not once for each", () => {
    const changes: boolean[] = [];
    render(() => <InALabel onChange={(on) => changes.push(on)} />);
    user.click(box().parentElement as HTMLElement);
    flush();
    expect(changes).toEqual([true]);
    expect(box().checked).toBe(true);
  });

  test("a label elsewhere still reaches it by id", () => {
    const changes: boolean[] = [];
    render(() => (
      <>
        <label for="agree">I agree</label>
        <Checkbox id="agree" onChange={(on) => changes.push(on)} />
      </>
    ));
    expect(accessibleName(box())).toBe("I agree");
    user.click(document.querySelector("label") as HTMLElement);
    flush();
    expect(changes).toEqual([true]);
  });

  test("a checkbox in a group follows the same rule", () => {
    const seen: string[][] = [];
    render(() => (
      <CheckboxGroup label="Toppings" onChange={(next) => seen.push([...next])}>
        <GroupCheckbox value="olives">Olives</GroupCheckbox>
        <GroupCheckbox value="capers" aria-label="Capers" />
      </CheckboxGroup>
    ));
    const [olives, capers] = screen.getAllByRole<HTMLInputElement>("checkbox");
    expect(olives?.parentElement?.tagName).toBe("LABEL");
    expect(capers?.parentElement?.tagName).toBe("SPAN");

    user.click(capers?.parentElement as HTMLElement);
    flush();
    expect(seen).toEqual([["capers"]]);
  });
});

describe("Checkbox, focus", () => {
  test("a press on its label focuses it, as WebKit does not", () => {
    render(() => (
      <>
        <button type="button">Before</button>
        <Checkbox>I agree</Checkbox>
      </>
    ));
    const before = screen.getByRole("button");
    before.focus();

    user.click(box().parentElement as HTMLElement);
    flush();

    expect(box().checked).toBe(true);
    expect(document.activeElement).toBe(box());
  });

  function box(): HTMLInputElement {
    return screen.getByRole<HTMLInputElement>("checkbox");
  }
});

describe("Checkbox, help text", () => {
  test("a description is rendered after the label and describes the checkbox", () => {
    render(() => <Checkbox description="We send one a month">Newsletter</Checkbox>);
    const box = screen.getByRole("checkbox");

    expect(accessibleName(box)).toBe("Newsletter");
    expect(accessibleDescription(box)).toBe("We send one a month");
  });

  test("an error message is shown and described only while it is invalid", () => {
    const [invalid, setInvalid] = createSignal(false);
    render(() => (
      <Checkbox isInvalid={invalid()} errorMessage="You have to agree">
        I agree
      </Checkbox>
    ));
    const box = screen.getByRole("checkbox");
    expect(accessibleDescription(box)).toBe("");
    expect(screen.queryByText("You have to agree")).toBeNull();

    setInvalid(true);
    flush();
    expect(accessibleDescription(box)).toBe("You have to agree");
  });

  test("without a message of its own, what validation found is shown", () => {
    render(() => (
      <Checkbox validate={(on: boolean) => (on ? null : "You have to agree")}>I agree</Checkbox>
    ));
    expect(accessibleDescription(screen.getByRole("checkbox"))).toBe("You have to agree");
  });

  test("the caller's own aria-describedby is kept", () => {
    render(() => (
      <>
        <p id="terms">Terms apply</p>
        <Checkbox aria-describedby="terms" description="Monthly">
          Newsletter
        </Checkbox>
      </>
    ));
    expect(accessibleDescription(screen.getByRole("checkbox"))).toBe("Monthly Terms apply");
  });
});

describe("Checkbox, required", () => {
  test("under aria it does not block the submit, and says it is required", () => {
    render(() => (
      <Form aria-label="Terms">
        <Checkbox isRequired>I agree</Checkbox>
      </Form>
    ));
    const box = screen.getByRole<HTMLInputElement>("checkbox");

    expect(box.required).toBe(false);
    expect(box.getAttribute("aria-required")).toBe("true");
    expect(screen.getByRole<HTMLFormElement>("form").checkValidity()).toBe(true);
  });

  test("under native the browser blocks the submit", () => {
    render(() => (
      <Form aria-label="Terms" validationBehavior="native">
        <Checkbox isRequired>I agree</Checkbox>
      </Form>
    ));
    const box = screen.getByRole<HTMLInputElement>("checkbox");

    expect(box.required).toBe(true);
    expect(box.hasAttribute("aria-required")).toBe(false);
    expect(screen.getByRole<HTMLFormElement>("form").checkValidity()).toBe(false);
  });

  test("the label says so to a stylesheet", () => {
    render(() => <Checkbox isRequired>I agree</Checkbox>);
    expect(screen.getByRole("checkbox").parentElement?.hasAttribute("data-required")).toBe(true);
  });
});

describe("Checkbox, form reset", () => {
  test("a reset that was cancelled leaves it alone", () => {
    render(() => (
      <form data-testid="form">
        <Checkbox name="agree">I agree</Checkbox>
      </form>
    ));
    const form = screen.getByTestId<HTMLFormElement>("form");
    const box = screen.getByRole<HTMLInputElement>("checkbox");
    user.click(box.parentElement as HTMLElement);
    flush();

    form.addEventListener("reset", (event) => event.preventDefault(), { capture: true });
    form.dispatchEvent(new Event("reset", { bubbles: true, cancelable: true }));
    flush();

    expect(box.checked).toBe(true);
    expect(box.parentElement?.hasAttribute("data-selected")).toBe(true);
  });
});

describe("CheckboxGroup, its members", () => {
  test("each member is described by the group's description and error", () => {
    render(() => (
      <CheckboxGroup
        label="Toppings"
        description="Pick as many as you like"
        isInvalid
        errorMessage="Pick at least one"
      >
        <GroupCheckbox value="cheese">Cheese</GroupCheckbox>
        <GroupCheckbox value="olives">Olives</GroupCheckbox>
      </CheckboxGroup>
    ));

    for (const box of screen.getAllByRole("checkbox")) {
      expect(accessibleDescription(box)).toBe("Pick as many as you like Pick at least one");
    }
  });

  test("a required group lets the form submit once one box is checked", () => {
    render(() => (
      <Form aria-label="Order" validationBehavior="native">
        <CheckboxGroup label="Toppings" name="toppings" isRequired>
          <GroupCheckbox value="cheese">Cheese</GroupCheckbox>
          <GroupCheckbox value="olives">Olives</GroupCheckbox>
        </CheckboxGroup>
      </Form>
    ));
    const form = screen.getByRole<HTMLFormElement>("form");
    const [cheese, olives] = screen.getAllByRole<HTMLInputElement>("checkbox");

    expect([cheese?.required, olives?.required]).toEqual([true, true]);
    expect(form.checkValidity()).toBe(false);

    user.click(cheese?.parentElement as HTMLElement);
    flush();

    expect([cheese?.required, olives?.required]).toEqual([false, false]);
    expect(form.checkValidity()).toBe(true);
  });

  test("a required group under aria marks its members without blocking", () => {
    render(() => (
      <Form aria-label="Order">
        <CheckboxGroup label="Toppings" isRequired>
          <GroupCheckbox value="cheese">Cheese</GroupCheckbox>
        </CheckboxGroup>
      </Form>
    ));
    const box = screen.getByRole<HTMLInputElement>("checkbox");
    expect(box.required).toBe(false);
    expect(box.getAttribute("aria-required")).toBe("true");
    expect(screen.getByRole<HTMLFormElement>("form").checkValidity()).toBe(true);
  });

  test("the members take the group's form", () => {
    render(() => (
      <CheckboxGroup label="Toppings" name="toppings" form="order">
        <GroupCheckbox value="cheese">Cheese</GroupCheckbox>
      </CheckboxGroup>
    ));
    const box = screen.getByRole<HTMLInputElement>("checkbox");
    expect(box.getAttribute("form")).toBe("order");
    expect(box.name).toBe("toppings");
  });
});
