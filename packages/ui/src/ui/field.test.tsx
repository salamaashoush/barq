import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
  fieldVariants,
} from "./field.tsx";
import { Input } from "./input.tsx";
import { srOnly } from "./sr-only.ts";

function slot(name: string): HTMLElement {
  const found = document.querySelector(`[data-slot="${name}"]`);
  if (found === null) throw new Error(`no [data-slot="${name}"]`);
  return found as HTMLElement;
}

describe("Field", () => {
  test("a field is a group, and its label names the control", () => {
    render(() => (
      <Field>
        <FieldLabel for="street">Street</FieldLabel>
        <Input id="street" />
        <FieldDescription>Where the parcel goes.</FieldDescription>
      </Field>
    ));

    expect(screen.getByRole("group")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Street" })).toBeTruthy();
    expect(slot("field-description").tagName).toBe("P");
  });

  test("the label answers to its own slot, not to the Label's", () => {
    render(() => <FieldLabel>Street</FieldLabel>);
    expect(slot("field-label").tagName).toBe("LABEL");
  });

  test("the orientation is an attribute as well as a class", () => {
    render(() => <Field orientation="horizontal">a</Field>);
    expect(slot("field").getAttribute("data-orientation")).toBe("horizontal");
  });

  test("vertical is the default, and it stacks", () => {
    render(() => <Field>a</Field>);
    const field = slot("field");
    expect(field.getAttribute("data-orientation")).toBe("vertical");
    const rules = rulesFor(field.className);
    expect(rules).toContain("flex-direction: column");
  });

  test("invalid colours the whole row, by presence", () => {
    render(() => <Field isInvalid>a</Field>);
    const field = slot("field");
    expect(field.getAttribute("data-invalid")).toBe("");
    expect(rulesFor(fieldVariants())).toContain("[data-invalid]{color: var(--destructive)}");
  });

  test("disabled dims the label through the field, not through a marker class", () => {
    render(() => (
      <Field isDisabled>
        <FieldLabel>Street</FieldLabel>
      </Field>
    ));
    expect(slot("field").getAttribute("data-disabled")).toBe("");
    const rules = rulesFor(slot("field-label").className);
    expect(rules).toContain('[data-slot="field"][data-disabled] .');
  });

  test("a screen-reader-only child keeps its own width inside a vertical field", () => {
    // `& > * { width: 100% }` and `sr-only` are both one class in one layer, so
    // whichever registered last used to win. `sr-only` is `&&` for that reason.
    const rules = rulesFor(srOnly);
    expect(rules).toContain(`.${srOnly}.${srOnly}`);
  });
});

describe("FieldSet", () => {
  test("it is a real fieldset with a legend", () => {
    render(() => (
      <FieldSet>
        <FieldLegend>Delivery</FieldLegend>
        <FieldGroup>
          <Field>a</Field>
        </FieldGroup>
      </FieldSet>
    ));
    expect(screen.getByRole("group", { name: "Delivery" })).toBeTruthy();
    expect(slot("field-set").tagName).toBe("FIELDSET");
    expect(slot("field-legend").tagName).toBe("LEGEND");
  });

  test("the legend variant is an attribute the description's rule reads", () => {
    render(() => <FieldLegend variant="label">Delivery</FieldLegend>);
    expect(slot("field-legend").getAttribute("data-variant")).toBe("label");
  });

  test("a group names the container the responsive orientation measures", () => {
    render(() => <FieldGroup>a</FieldGroup>);
    const rules = rulesFor(slot("field-group").className);
    expect(rules).toContain("container-name: field-group");
  });

  test("responsive turns horizontal inside that container and nowhere else", () => {
    const responsive = fieldVariants({ orientation: "responsive" });
    expect(rulesFor(responsive)).toContain("@container field-group (width >= 28rem)");
  });
});

describe("FieldSeparator", () => {
  test("a bare separator is a rule and nothing else", () => {
    render(() => <FieldSeparator />);
    expect(slot("field-separator-line").tagName).toBe("HR");
    expect(document.querySelector('[data-slot="field-separator-content"]')).toBeNull();
    expect(slot("field-separator").hasAttribute("data-content")).toBe(false);
  });

  test("children sit on the line", () => {
    render(() => <FieldSeparator>or</FieldSeparator>);
    expect(slot("field-separator-content").textContent).toBe("or");
    expect(slot("field-separator").getAttribute("data-content")).toBe("");
  });
});

describe("FieldError", () => {
  test("nothing at all when there is nothing to say", () => {
    render(() => <FieldError errors={[]} />);
    expect(document.querySelector('[data-slot="field-error"]')).toBeNull();
  });

  test("one message is announced as an alert", () => {
    render(() => <FieldError errors={[{ message: "Required" }]} />);
    const error = screen.getByRole("alert");
    expect(error.textContent).toBe("Required");
    expect(error.querySelector("ul")).toBeNull();
  });

  test("several become a list, and a repeat is shown once", () => {
    render(() => (
      <FieldError
        errors={[{ message: "Required" }, { message: "Too short" }, { message: "Required" }]}
      />
    ));
    const items = screen.getByRole("alert").querySelectorAll("li");
    expect([...items].map((item) => item.textContent)).toEqual(["Required", "Too short"]);
  });

  test("children win over the errors", () => {
    render(() => <FieldError errors={[{ message: "Required" }]}>Say something else</FieldError>);
    expect(screen.getByRole("alert").textContent).toBe("Say something else");
  });
});

describe("FieldContent and FieldTitle", () => {
  test("a checkbox row names itself with a title rather than a label", () => {
    render(() => (
      <Field orientation="horizontal">
        <FieldContent>
          <FieldTitle>Send receipts</FieldTitle>
          <FieldDescription>One email per payment.</FieldDescription>
        </FieldContent>
      </Field>
    ));
    expect(slot("field-title").textContent).toBe("Send receipts");
    expect(slot("field-content")).toBeTruthy();
  });
});
