import { describe, expect, test } from "bun:test";
import { flush, createSignal } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import { Checkbox, CheckboxGroup, GroupCheckbox, useCheckbox } from "./checkbox.tsx";
import { getInteractionModality, isFocusVisible } from "./interactions/modality.ts";

describe("Checkbox", () => {
  test("is a real checkbox with a name from its label", () => {
    render(() => <Checkbox>I agree</Checkbox>);
    const box = screen.getByRole("checkbox") as HTMLInputElement;

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
    const box = screen.getByRole("checkbox") as HTMLInputElement;
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
    const box = screen.getByRole("checkbox") as HTMLInputElement;

    user.click(box.parentElement as HTMLElement);

    expect(changes).toEqual([true]);
    expect(box.checked).toBe(true);
  });

  test("Space toggles it from the keyboard", () => {
    render(() => <Checkbox>I agree</Checkbox>);
    const box = screen.getByRole("checkbox") as HTMLInputElement;

    box.focus();
    // The platform's own activation fires `change`, which is what a real
    // browser does for a focused checkbox.
    box.click();
    flush();

    expect(box.checked).toBe(true);
  });

  test("indeterminate is a property and announces as mixed", () => {
    render(() => <Checkbox isIndeterminate>Some</Checkbox>);
    const box = screen.getByRole("checkbox") as HTMLInputElement;

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
    const box = screen.getByRole("checkbox") as HTMLInputElement;

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
    const box = screen.getByRole("checkbox") as HTMLInputElement;

    expect(box.getAttribute("aria-readonly")).toBe("true");
    user.click(box.parentElement as HTMLElement);
    expect(box.checked).toBe(true);
  });

  test("controlled: the prop owns the value", () => {
    const [selected, setSelected] = createSignal(false);
    render(() => <Checkbox isSelected={selected()}>I agree</Checkbox>);
    const box = screen.getByRole("checkbox") as HTMLInputElement;

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

    const form = screen.getByTestId("form") as HTMLFormElement;
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

    const box = screen.getByRole("checkbox") as HTMLInputElement;
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

    const [cheese, olives] = screen.getAllByRole("checkbox") as HTMLInputElement[];

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

describe("Checkbox, with nothing of its own to say", () => {
  const box = (): HTMLInputElement => screen.getByRole("checkbox") as HTMLInputElement;

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

  function InALabel(props: { onChange?: (on: boolean) => void }) {
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
    const [olives, capers] = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(olives?.parentElement?.tagName).toBe("LABEL");
    expect(capers?.parentElement?.tagName).toBe("SPAN");

    user.click(capers?.parentElement as HTMLElement);
    flush();
    expect(seen).toEqual([["capers"]]);
  });
});
