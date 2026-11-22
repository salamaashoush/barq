import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import {
  accessibleDescription,
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  tick,
  user,
} from "@barqjs/testing";
import { Form } from "./form.tsx";
import { Radio, RadioGroup, useRadio } from "./radio.tsx";
import { SelectionIndicator } from "./selection-indicator.tsx";

function Dot() {
  const item = useRadio();
  return (
    <span
      data-testid="dot"
      data-state={() => (item.isSelected() ? "checked" : "unchecked")}
      data-disabled={() => (item.isDisabled() ? "" : undefined)}
    />
  );
}

describe("Radio", () => {
  test("says checked or unchecked as an attribute, beside data-selected", () => {
    render(() => (
      <RadioGroup label="Size" defaultValue="m">
        <Radio value="s">Small</Radio>
        <Radio value="m">Medium</Radio>
      </RadioGroup>
    ));
    const [small, medium] = screen.getAllByRole("radio");
    expect(small?.parentElement?.getAttribute("data-state")).toBe("unchecked");
    expect(medium?.parentElement?.getAttribute("data-state")).toBe("checked");

    user.click(small as HTMLElement);
    flush();
    expect(small?.parentElement?.getAttribute("data-state")).toBe("checked");
    expect(medium?.parentElement?.getAttribute("data-state")).toBe("unchecked");
  });

  test("a part drawn inside one reads its state, not its neighbour's", () => {
    render(() => (
      <RadioGroup label="Size" defaultValue="m">
        <Radio value="s" aria-label="Small">
          <Dot />
        </Radio>
        <Radio value="m" aria-label="Medium" isDisabled>
          <Dot />
        </Radio>
      </RadioGroup>
    ));
    const [first, second] = screen.getAllByTestId("dot");
    expect(first?.getAttribute("data-state")).toBe("unchecked");
    expect(second?.getAttribute("data-state")).toBe("checked");
    expect(first?.hasAttribute("data-disabled")).toBe(false);
    expect(second?.getAttribute("data-disabled")).toBe("");
  });

  test("a part outside a radio says what is wrong", () => {
    expect(() => render(() => <Dot />)).toThrow("inside a Radio");
  });
});

describe("Radio, with nothing of its own to say", () => {
  const radios = (): HTMLInputElement[] => screen.getAllByRole<HTMLInputElement>("radio");

  test("with label content it is the label, and without any it renders none", () => {
    render(() => (
      <RadioGroup label="Size">
        <Radio value="s">Small</Radio>
        <Radio value="m" aria-label="Medium" />
      </RadioGroup>
    ));
    const [small, medium] = radios();
    expect(small?.parentElement?.tagName).toBe("LABEL");
    expect(accessibleName(small as HTMLElement)).toBe("Small");
    expect(medium?.parentElement?.tagName).toBe("SPAN");
  });

  test("children that are a drawing can ask for the bare form", () => {
    render(() => (
      <RadioGroup label="Size">
        <Radio value="s" aria-label="Small" elementType="span">
          <Dot />
        </Radio>
      </RadioGroup>
    ));
    expect(radios()[0]?.parentElement?.tagName).toBe("SPAN");
    expect(screen.getByTestId("dot").parentElement).toBe(radios()[0]?.parentElement as HTMLElement);
  });

  test("on its own, a press on its body selects it once and takes focus", () => {
    const chosen: string[] = [];
    render(() => (
      <RadioGroup label="Size" onChange={(value) => chosen.push(value)}>
        <Radio value="s" aria-label="Small" />
        <Radio value="m" aria-label="Medium" />
      </RadioGroup>
    ));
    const [, medium] = radios();
    user.click(medium?.parentElement as HTMLElement);
    flush();
    expect(chosen).toEqual(["m"]);
    expect(medium?.checked).toBe(true);
    expect(document.activeElement).toBe(medium as HTMLElement);
  });

  test("a disabled one ignores a press on its body", () => {
    const chosen: string[] = [];
    render(() => (
      <RadioGroup label="Size" onChange={(value) => chosen.push(value)}>
        <Radio value="s" aria-label="Small" isDisabled />
      </RadioGroup>
    ));
    user.click(radios()[0]?.parentElement as HTMLElement);
    flush();
    expect(chosen).toEqual([]);
  });

  test("inside a caller's label there is one label per radio, and a press selects once", () => {
    const chosen: string[] = [];
    const { container } = render(() => (
      <RadioGroup label="Size" onChange={(value) => chosen.push(value)}>
        <label>
          <span data-testid="small-text">Small</span>
          <Radio value="s" />
        </label>
        <label>
          <span>Medium</span>
          <Radio value="m" />
        </label>
      </RadioGroup>
    ));
    expect(container.querySelectorAll("label label")).toHaveLength(0);
    expect(accessibleName(radios()[0] as HTMLElement)).toBe("Small");
    expectNoAriaViolations(container);

    user.click(screen.getByTestId("small-text"));
    flush();
    expect(chosen).toEqual(["s"]);

    user.click(radios()[1]?.parentElement as HTMLElement);
    flush();
    expect(chosen).toEqual(["s", "m"]);
  });

  test("a label elsewhere still reaches it by id", () => {
    const chosen: string[] = [];
    render(() => (
      <>
        <RadioGroup label="Size" onChange={(value) => chosen.push(value)}>
          <Radio value="s" id="size-small" />
        </RadioGroup>
        <label for="size-small">Small</label>
      </>
    ));
    expect(accessibleName(radios()[0] as HTMLElement)).toBe("Small");
    user.click(document.querySelector('label[for="size-small"]') as HTMLElement);
    flush();
    expect(chosen).toEqual(["s"]);
  });
});

describe("Radio, described by its group", () => {
  test("each radio is described by the group's description and its error", () => {
    render(() => (
      <RadioGroup label="Size" description="Shirt size" isInvalid errorMessage="Pick one">
        <Radio value="s">Small</Radio>
        <Radio value="m">Medium</Radio>
      </RadioGroup>
    ));

    for (const radio of screen.getAllByRole("radio")) {
      expect(accessibleDescription(radio)).toBe("Shirt size Pick one");
    }
  });

  test("the error stops describing them once the group is valid", () => {
    render(() => (
      <RadioGroup label="Size" errorMessage="Pick one">
        <Radio value="s">Small</Radio>
      </RadioGroup>
    ));
    expect(accessibleDescription(screen.getByRole("radio"))).toBe("");
  });

  test("a radio's own description comes first", () => {
    render(() => (
      <RadioGroup label="Size" description="Shirt size">
        <Radio value="s" description="Fits up to 90cm">
          Small
        </Radio>
      </RadioGroup>
    ));
    const radio = screen.getByRole("radio");
    expect(accessibleName(radio)).toBe("Small");
    expect(accessibleDescription(radio)).toBe("Fits up to 90cm Shirt size");
  });
});

describe("RadioGroup, in a form", () => {
  test("a reset with no default clears the choice", () => {
    render(() => (
      <Form aria-label="Order">
        <RadioGroup label="Size" name="size">
          <Radio value="s">Small</Radio>
          <Radio value="m">Medium</Radio>
        </RadioGroup>
      </Form>
    ));
    const radios = screen.getAllByRole<HTMLInputElement>("radio");
    user.click(radios[1]?.parentElement as HTMLElement);
    flush();
    expect(radios[1]?.checked).toBe(true);

    screen.getByRole<HTMLFormElement>("form").reset();
    flush();

    expect(radios.map((radio) => radio.checked)).toEqual([false, false]);
    expect(radios.map((radio) => radio.parentElement?.hasAttribute("data-selected"))).toEqual([
      false,
      false,
    ]);
  });

  test("a reset returns to the default", () => {
    render(() => (
      <Form aria-label="Order">
        <RadioGroup label="Size" name="size" defaultValue="s">
          <Radio value="s">Small</Radio>
          <Radio value="m">Medium</Radio>
        </RadioGroup>
      </Form>
    ));
    const radios = screen.getAllByRole<HTMLInputElement>("radio");
    user.click(radios[1]?.parentElement as HTMLElement);
    flush();

    screen.getByRole<HTMLFormElement>("form").reset();
    flush();

    expect(radios.map((radio) => radio.checked)).toEqual([true, false]);
  });

  test("the radios take the group's form", () => {
    render(() => (
      <RadioGroup label="Size" name="size" form="order">
        <Radio value="s">Small</Radio>
      </RadioGroup>
    ));
    expect(screen.getByRole("radio").getAttribute("form")).toBe("order");
  });

  test("under aria, required does not block the submit", () => {
    render(() => (
      <Form aria-label="Order">
        <RadioGroup label="Size" name="size" isRequired>
          <Radio value="s">Small</Radio>
        </RadioGroup>
      </Form>
    ));
    expect(screen.getByRole<HTMLInputElement>("radio").required).toBe(false);
    expect(screen.getByRole("radiogroup").getAttribute("aria-required")).toBe("true");
    expect(screen.getByRole<HTMLFormElement>("form").checkValidity()).toBe(true);
  });

  test("under native, required blocks the submit and the error shows after it", () => {
    render(() => (
      <Form aria-label="Order" validationBehavior="native">
        <RadioGroup label="Size" name="size" isRequired>
          <Radio value="s">Small</Radio>
          <Radio value="m">Medium</Radio>
        </RadioGroup>
      </Form>
    ));
    const group = screen.getByRole("radiogroup");
    const form = screen.getByRole<HTMLFormElement>("form");
    expect(group.hasAttribute("aria-invalid")).toBe(false);

    expect(form.checkValidity()).toBe(false);
    flush();

    expect(group.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(screen.getAllByRole("radio")[0] as HTMLElement);
  });

  test("under native, the page's own error blocks the submit", () => {
    render(() => (
      <Form aria-label="Order" validationBehavior="native">
        <RadioGroup
          label="Size"
          name="size"
          defaultValue="s"
          validate={(value: string | null) => (value === "s" ? "Too small" : null)}
        >
          <Radio value="s">Small</Radio>
          <Radio value="m">Medium</Radio>
        </RadioGroup>
      </Form>
    ));
    flush();
    const form = screen.getByRole<HTMLFormElement>("form");
    expect(form.checkValidity()).toBe(false);

    user.click(screen.getAllByRole("radio")[1]?.parentElement as HTMLElement);
    flush();
    expect(form.checkValidity()).toBe(true);
  });
});

describe("Radio, focus and attributes", () => {
  test("a press on its label focuses it, as WebKit does not", () => {
    render(() => (
      <RadioGroup label="Size">
        <Radio value="s">Small</Radio>
        <Radio value="m">Medium</Radio>
      </RadioGroup>
    ));
    const medium = screen.getAllByRole<HTMLInputElement>("radio")[1] as HTMLInputElement;

    user.click(medium.parentElement as HTMLElement);
    flush();

    expect(medium.checked).toBe(true);
    expect(document.activeElement).toBe(medium);
  });

  test("says read-only and required to a stylesheet", () => {
    render(() => (
      <RadioGroup label="Size" isReadOnly isRequired>
        <Radio value="s">Small</Radio>
      </RadioGroup>
    ));
    const label = screen.getByRole("radio").parentElement as HTMLElement;
    expect(label.hasAttribute("data-readonly")).toBe(true);
    expect(label.hasAttribute("data-required")).toBe(true);
  });
});

describe("Radio, with a selection indicator", () => {
  const MOVES = { "transition-property": "translate", "transition-duration": "0ms" };

  function Sizes() {
    return (
      <RadioGroup label="Size" defaultValue="m">
        <Radio value="s">
          Small
          <SelectionIndicator data-testid="indicator-s" style={MOVES} />
        </Radio>
        <Radio value="m">
          Medium
          <SelectionIndicator data-testid="indicator-m" style={MOVES} />
        </Radio>
      </RadioGroup>
    );
  }

  const shown = (): string[] =>
    screen.queryAllByTestId(/^indicator-/).map((each) => each.dataset.testid ?? "");

  test("only the chosen radio's indicator is rendered, and it follows the choice", async () => {
    render(() => <Sizes />);
    expect(shown()).toEqual(["indicator-m"]);

    user.click(screen.getAllByRole("radio")[0]?.parentElement as HTMLElement);
    flush();
    await tick();
    flush();

    expect(shown()).toEqual(["indicator-s"]);
  });

  test("the indicator slides from the old radio to the new one", async () => {
    render(() => <Sizes />);
    await new Promise((resolve) => setTimeout(resolve, 40));
    flush();
    screen.getByTestId("indicator-m").getBoundingClientRect = () =>
      ({ left: 0, top: 40, width: 10, height: 10, right: 10, bottom: 50, x: 0, y: 40 }) as DOMRect;

    user.click(screen.getAllByRole("radio")[0]?.parentElement as HTMLElement);
    flush();

    // The group is one transition, so the new indicator starts where the old
    // one was rather than appearing in place.
    expect(screen.getByTestId("indicator-s").style.translate).toBe("0px 40px");
  });
});
