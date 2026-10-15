import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import { Radio, RadioGroup, useRadio } from "./radio.tsx";

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
  const radios = (): HTMLInputElement[] => screen.getAllByRole("radio") as HTMLInputElement[];

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
