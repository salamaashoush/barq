import { describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import { SelectionIndicator } from "./selection-indicator.tsx";
import {
  ToggleButtonGroup,
  ToggleButtonGroupItem,
  type ToggleButtonGroupComponentProps,
} from "./toggle-button-group.tsx";

function Alignment(props: Omit<ToggleButtonGroupComponentProps, "children">) {
  return (
    <ToggleButtonGroup aria-label="Alignment" {...props}>
      <ToggleButtonGroupItem id="left">Left</ToggleButtonGroupItem>
      <ToggleButtonGroupItem id="right">Right</ToggleButtonGroupItem>
    </ToggleButtonGroup>
  );
}

function buttons(): HTMLElement[] {
  return screen.getAllByRole("button");
}

function pressed(): (string | null)[] {
  return buttons().map((each) => each.getAttribute("aria-pressed"));
}

describe("ToggleButtonGroup", () => {
  test("is a named group of toggle buttons", () => {
    render(() => <Alignment />);

    const group = screen.getByRole("group");
    expect(accessibleName(group)).toBe("Alignment");
    expect(group.getAttribute("data-orientation")).toBe("horizontal");
    expect(pressed()).toEqual(["false", "false"]);
    expectNoAriaViolations(document.body);
  });

  test("forwards class and data attributes", () => {
    render(() => <Alignment class="acme" data-foo="bar" />);

    const group = screen.getByRole("group");
    expect(group.getAttribute("class")).toBe("acme");
    expect(group.getAttribute("data-foo")).toBe("bar");
  });

  test("an item's id is its key, not a DOM id", () => {
    render(() => <Alignment />);
    expect(buttons()[0]?.id).not.toBe("left");
  });

  test("uncontrolled single selection keeps one, and pressing it again releases it", () => {
    const seen: string[][] = [];
    render(() => <Alignment onSelectionChange={(keys) => seen.push(keys)} />);

    user.click(buttons()[1] as HTMLElement);
    flush();
    expect(pressed()).toEqual(["false", "true"]);

    user.click(buttons()[0] as HTMLElement);
    flush();
    expect(pressed()).toEqual(["true", "false"]);

    user.click(buttons()[0] as HTMLElement);
    flush();
    expect(pressed()).toEqual(["false", "false"]);
    expect(seen).toEqual([["right"], ["left"], []]);
  });

  test("disallowEmptySelection keeps the last pressed item pressed", () => {
    const seen: string[][] = [];
    render(() => (
      <Alignment
        disallowEmptySelection
        defaultSelectedKeys={["left"]}
        onSelectionChange={(keys) => seen.push(keys)}
      />
    ));

    user.click(buttons()[0] as HTMLElement);
    flush();
    expect(pressed()).toEqual(["true", "false"]);
    expect(seen).toEqual([]);

    user.click(buttons()[1] as HTMLElement);
    flush();
    expect(pressed()).toEqual(["false", "true"]);
  });

  test("controlled single selection reports and keeps what it is given", () => {
    const seen: string[][] = [];
    render(() => <Alignment selectedKeys={[]} onSelectionChange={(keys) => seen.push(keys)} />);

    user.click(buttons()[1] as HTMLElement);
    flush();

    expect(seen).toEqual([["right"]]);
    expect(pressed()).toEqual(["false", "false"]);
  });

  test("uncontrolled multiple selection presses any number", () => {
    const seen: string[][] = [];
    render(() => (
      <Alignment selectionMode="multiple" onSelectionChange={(keys) => seen.push(keys)} />
    ));

    user.click(buttons()[1] as HTMLElement);
    flush();
    user.click(buttons()[0] as HTMLElement);
    flush();

    expect(pressed()).toEqual(["true", "true"]);
    expect(seen).toEqual([["right"], ["right", "left"]]);
  });

  test("controlled multiple selection follows its owner", () => {
    const [keys, setKeys] = createSignal<readonly string[]>(["left"]);
    const seen: string[][] = [];
    render(() => (
      <Alignment
        selectionMode="multiple"
        selectedKeys={keys()}
        onSelectionChange={(next) => seen.push(next)}
      />
    ));
    expect(pressed()).toEqual(["true", "false"]);

    user.click(buttons()[1] as HTMLElement);
    flush();
    expect(seen).toEqual([["left", "right"]]);
    expect(pressed()).toEqual(["true", "false"]);

    setKeys(["left", "right"]);
    flush();
    expect(pressed()).toEqual(["true", "true"]);
  });

  test("disabled, the group says so and no item can be pressed or hovered", () => {
    render(() => <Alignment isDisabled />);

    const group = screen.getByRole("group");
    expect(group.getAttribute("aria-disabled")).toBe("true");
    expect(group.hasAttribute("data-disabled")).toBe(true);
    for (const button of buttons()) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      user.hover(button);
      flush();
      expect(button.hasAttribute("data-hovered")).toBe(false);
    }
  });

  test("one disabled item is skipped by the arrows", () => {
    render(() => (
      <ToggleButtonGroup aria-label="Size">
        <ToggleButtonGroupItem id="s">S</ToggleButtonGroupItem>
        <ToggleButtonGroupItem id="m" isDisabled>
          M
        </ToggleButtonGroupItem>
        <ToggleButtonGroupItem id="l">L</ToggleButtonGroupItem>
      </ToggleButtonGroup>
    ));

    user.tab();
    expect(document.activeElement).toBe(buttons()[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(buttons()[2] as HTMLElement);
  });

  test("horizontal: one tab stop, and the left and right arrows move", () => {
    render(() => (
      <>
        <Alignment />
        <button type="button">After</button>
      </>
    ));

    user.tab();
    expect(document.activeElement).toBe(buttons()[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(buttons()[1] as HTMLElement);
    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement).toBe(buttons()[0] as HTMLElement);

    user.tab();
    expect(document.activeElement?.textContent).toBe("After");
  });

  test("vertical: the up and down arrows move, left and right do not", () => {
    render(() => <Alignment orientation="vertical" />);
    expect(screen.getByRole("group").getAttribute("data-orientation")).toBe("vertical");

    user.tab();
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(buttons()[1] as HTMLElement);
    user.keyDown("ArrowUp");
    flush();
    expect(document.activeElement).toBe(buttons()[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(buttons()[0] as HTMLElement);
  });

  test("Tab returns to the pressed item", () => {
    render(() => (
      <>
        <button type="button">Before</button>
        <Alignment defaultSelectedKeys={["right"]} />
      </>
    ));

    user.tab();
    user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Right" }));
  });

  test("Space and Enter press the focused item", () => {
    render(() => <Alignment selectionMode="multiple" />);

    user.tab();
    user.key(" ");
    flush();
    expect(pressed()).toEqual(["true", "false"]);

    user.keyDown("ArrowRight");
    flush();
    user.key("Enter");
    flush();
    expect(pressed()).toEqual(["true", "true"]);
  });

  test("a selection indicator follows the pressed item", () => {
    const [keys, setKeys] = createSignal<readonly string[]>(["left"]);
    render(() => (
      <ToggleButtonGroup aria-label="Alignment" selectedKeys={keys()}>
        <ToggleButtonGroupItem id="left">
          Left
          <SelectionIndicator data-testid="indicator-left" />
        </ToggleButtonGroupItem>
        <ToggleButtonGroupItem id="right">
          Right
          <SelectionIndicator data-testid="indicator-right" />
        </ToggleButtonGroupItem>
      </ToggleButtonGroup>
    ));
    expect(screen.queryByTestId("indicator-left")).not.toBeNull();
    expect(screen.queryByTestId("indicator-right")).toBeNull();

    setKeys(["right"]);
    flush();
    expect(screen.queryByTestId("indicator-right")).not.toBeNull();
  });

  test("an item outside a group is a mistake that says so", () => {
    expect(() => render(() => <ToggleButtonGroupItem id="x">X</ToggleButtonGroupItem>)).toThrow(
      /ToggleButtonGroup/,
    );
  });
});
