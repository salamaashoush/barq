import { afterEach, describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import {
  accessibleName,
  cleanup,
  expectNoAriaViolations,
  render,
  screen,
  user,
} from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";
import { Field, FieldLabel } from "./field.tsx";
import { Label } from "./label.tsx";
import { RadioGroup, RadioGroupItem } from "./radio-group.tsx";

afterEach(cleanup);

const slots = (name: string): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(
    `label[data-slot="${name}"], span[data-slot="${name}"]`,
  ),
];
const radios = (): HTMLInputElement[] => screen.getAllByRole("radio") as HTMLInputElement[];

function Sizes(props: {
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  orientation?: "horizontal" | "vertical";
  dir?: "ltr" | "rtl";
}) {
  return (
    <RadioGroup
      aria-label="Size"
      defaultValue="m"
      onValueChange={props.onValueChange}
      disabled={props.disabled}
      required={props.required}
      orientation={props.orientation}
      dir={props.dir}
    >
      <RadioGroupItem value="s" aria-label="Small" />
      <RadioGroupItem value="m" aria-label="Medium" />
      <RadioGroupItem value="l" aria-label="Large" disabled />
    </RadioGroup>
  );
}

describe("RadioGroup", () => {
  test("each item and its indicator say checked or unchecked", async () => {
    render(() => <Sizes />);
    expect(slots("radio-group-item").map((item) => item.getAttribute("data-state"))).toEqual([
      "unchecked",
      "checked",
      "unchecked",
    ]);
    expect(slots("radio-group-indicator").map((item) => item.getAttribute("data-state"))).toEqual([
      "unchecked",
      "checked",
      "unchecked",
    ]);
    await user.click(radios()[0] as HTMLElement);
    flush();
    expect(slots("radio-group-item")[0]?.getAttribute("data-state")).toBe("checked");
    expect(slots("radio-group-indicator")[1]?.getAttribute("data-state")).toBe("unchecked");
  });

  test("onValueChange hears the choice", async () => {
    const seen: string[] = [];
    render(() => <Sizes onValueChange={(value) => seen.push(value)} />);
    await user.click(radios()[0] as HTMLElement);
    flush();
    expect(seen).toEqual(["s"]);
  });

  test("a disabled item says so, on the item and on its indicator", () => {
    render(() => <Sizes />);
    expect(radios()[2]?.disabled).toBe(true);
    expect(slots("radio-group-item")[2]?.getAttribute("data-disabled")).toBe("");
    expect(slots("radio-group-indicator")[2]?.getAttribute("data-disabled")).toBe("");
    expect(slots("radio-group-indicator")[0]?.hasAttribute("data-disabled")).toBe(false);
  });

  test("disabled on the group reaches every item", () => {
    render(() => <Sizes disabled />);
    expect(radios().every((radio) => radio.disabled)).toBe(true);
    expect(screen.getByRole("radiogroup").getAttribute("aria-disabled")).toBe("true");
  });

  test("required is announced by the group", () => {
    render(() => <Sizes required />);
    expect(screen.getByRole("radiogroup").getAttribute("aria-required")).toBe("true");
  });

  test("the arrows move the choice, wrapping past a disabled item", () => {
    render(() => <Sizes />);
    radios()[1]?.focus();
    user.keyboard("{ArrowDown}");
    flush();
    expect(radios()[0]?.checked).toBe(true);
    user.keyboard("{ArrowUp}");
    flush();
    expect(radios()[1]?.checked).toBe(true);
  });

  test("dir on a horizontal group mirrors left and right", () => {
    render(() => <Sizes orientation="horizontal" dir="rtl" />);
    const group = screen.getByRole("radiogroup");
    expect(group.getAttribute("dir")).toBe("rtl");
    expect(group.getAttribute("data-orientation")).toBe("horizontal");
    radios()[1]?.focus();
    user.keyboard("{ArrowRight}");
    flush();
    expect(radios()[0]?.checked).toBe(true);
    user.keyboard("{ArrowLeft}");
    flush();
    expect(radios()[1]?.checked).toBe(true);
  });
});

describe("RadioGroupItem, as the bare control upstream renders", () => {
  test("it renders no label of its own", () => {
    render(() => <Sizes />);
    expect(slots("radio-group-item").map((item) => item.tagName)).toEqual(["SPAN", "SPAN", "SPAN"]);
    expect(document.querySelectorAll("label")).toHaveLength(0);
  });

  test("a press on the circle selects it once and takes focus", async () => {
    const chosen: string[] = [];
    render(() => <Sizes onValueChange={(value) => chosen.push(value)} />);
    await user.click(slots("radio-group-item")[0] as HTMLElement);
    flush();
    expect(chosen).toEqual(["s"]);
    expect(radios()[0]?.checked).toBe(true);
    expect(document.activeElement).toBe(radios()[0] as HTMLElement);
  });

  test("a Label beside each names it and selects it, as the docs write it", async () => {
    const chosen: string[] = [];
    const { container } = render(() => (
      <RadioGroup
        aria-label="Plan"
        defaultValue="free"
        onValueChange={(value) => chosen.push(value)}
      >
        <div>
          <RadioGroupItem value="free" id="plan-free" />
          <Label for="plan-free">Free</Label>
        </div>
        <div>
          <RadioGroupItem value="team" id="plan-team" />
          <Label for="plan-team">Team</Label>
        </div>
      </RadioGroup>
    ));
    expect(radios().map((radio) => accessibleName(radio))).toEqual(["Free", "Team"]);
    expect(container.querySelectorAll("label")).toHaveLength(2);
    expectNoAriaViolations(container);

    await user.click(container.querySelector('label[for="plan-team"]') as HTMLElement);
    flush();
    expect(chosen).toEqual(["team"]);
  });

  test("inside a caller's label it nests none, and a press on either selects once", async () => {
    const chosen: string[] = [];
    const { container } = render(() => (
      <RadioGroup aria-label="Plan" onValueChange={(value) => chosen.push(value)}>
        <label>
          <RadioGroupItem value="free" />
          <span data-testid="free-text">Free</span>
        </label>
      </RadioGroup>
    ));
    expect(container.querySelectorAll("label label")).toHaveLength(0);
    expect(accessibleName(radios()[0] as HTMLElement)).toBe("Free");

    await user.click(slots("radio-group-item")[0] as HTMLElement);
    flush();
    expect(chosen).toEqual(["free"]);
  });
});

describe("RadioGroup, invalid", () => {
  function Plans(props: { isInvalid?: boolean; "aria-invalid"?: boolean }) {
    return (
      <RadioGroup
        aria-label="Plan"
        isInvalid={props.isInvalid}
        aria-invalid={props["aria-invalid"]}
      >
        <RadioGroupItem value="plus" aria-label="Plus" />
        <RadioGroupItem value="pro" aria-label="Pro" />
      </RadioGroup>
    );
  }

  test("an invalid group marks every radio in it, for a screen reader and for the eye", async () => {
    const { container } = render(() => <Plans isInvalid />);
    expect(screen.getByRole("radiogroup").getAttribute("aria-invalid")).toBe("true");
    expect(radios().map((each) => each.getAttribute("aria-invalid"))).toEqual(["true", "true"]);
    const items = slots("radio-group-item");
    expect(items.map((each) => each.hasAttribute("data-invalid"))).toEqual([true, true]);
    expect(rulesFor(items[0]?.className ?? "")).toContain(
      "[data-invalid]{border-top-color: var(--destructive)}",
    );

    await user.click(items[1] as HTMLElement);
    flush();
    expect(radios()[1]?.checked).toBe(true);
    expect(radios()[1]?.getAttribute("aria-invalid")).toBe("true");
    expectNoAriaViolations(container);
  });

  test("upstream's aria-invalid on the group says the same", () => {
    render(() => <Plans aria-invalid />);
    expect(radios().map((each) => each.getAttribute("aria-invalid"))).toEqual(["true", "true"]);
  });

  test("a valid group marks nothing", () => {
    render(() => <Plans />);
    expect(radios().map((each) => each.getAttribute("aria-invalid"))).toEqual([null, null]);
    expect(slots("radio-group-item").some((each) => each.hasAttribute("data-invalid"))).toBe(false);
  });

  test("inside an invalid Field, the group is invalid without being told", () => {
    render(() => (
      <Field isInvalid>
        <FieldLabel>Plan</FieldLabel>
        <Plans />
      </Field>
    ));
    expect(screen.getByRole("radiogroup").getAttribute("aria-invalid")).toBe("true");
    expect(radios().map((each) => each.getAttribute("aria-invalid"))).toEqual(["true", "true"]);
  });

  test("upstream's data-invalid on the Field does it too", () => {
    render(() => (
      <Field data-invalid="true">
        <Plans />
      </Field>
    ));
    expect(radios()[0]?.getAttribute("aria-invalid")).toBe("true");
  });
});
