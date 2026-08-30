import { describe, expect, test } from "bun:test";
import { flush, signal } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import { Checkbox, CheckboxGroup, GroupCheckbox } from "./checkbox.tsx";

describe("Checkbox", () => {
  test("is a real checkbox with a name from its label", () => {
    render(() => <Checkbox>I agree</Checkbox>);
    const box = screen.getByRole("checkbox") as HTMLInputElement;

    expect(box.tagName).toBe("INPUT");
    expect(box.type).toBe("checkbox");
    expect(accessibleName(box)).toBe("I agree");
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
    const selected = signal(false);
    render(() => <Checkbox isSelected={selected()}>I agree</Checkbox>);
    const box = screen.getByRole("checkbox") as HTMLInputElement;

    user.click(box.parentElement as HTMLElement);
    expect(box.checked).toBe(false);

    selected.set(true);
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
