import { describe, expect, test } from "bun:test";
import { flush, signal } from "@barqjs/core";
import { expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import { Button, ToggleButton } from "./button.tsx";

describe("Button", () => {
  test("is a button with an accessible name", () => {
    render(() => <Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
  });

  test("fires onPress for a click, a key and a screen reader", () => {
    const presses: string[] = [];
    render(() => <Button onPress={(e) => presses.push(e.pointerType)}>Save</Button>);
    const button = screen.getByRole("button");

    user.click(button);
    button.focus();
    user.key("Enter");
    user.key(" ");
    user.virtualClick(button);

    expect(presses).toEqual(["mouse", "keyboard", "keyboard", "virtual"]);
  });

  test("disabled is disabled to the platform and to assistive technology", () => {
    const presses: string[] = [];
    render(() => (
      <Button isDisabled onPress={() => presses.push("press")}>
        Save
      </Button>
    ));
    const button = screen.getByRole("button") as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(button.hasAttribute("data-disabled")).toBe(true);

    user.click(button);
    expect(presses).toEqual([]);
  });

  test("reports its interaction states as data attributes", () => {
    render(() => <Button>Save</Button>);
    const button = screen.getByRole("button");

    user.hover(button);
    expect(button.hasAttribute("data-hovered")).toBe(true);

    user.pointerDown(button);
    expect(button.hasAttribute("data-pressed")).toBe(true);
    expect(button.hasAttribute("data-focused")).toBe(true);

    // The press ends at the CLICK, not at pointer up: the DOM may be mutated
    // between the two, and the platform fires the click last.
    user.pointerUp(button);
    expect(button.hasAttribute("data-pressed")).toBe(true);

    user.click(button);
    expect(button.hasAttribute("data-pressed")).toBe(false);
  });

  test("passes class, style and data attributes through", () => {
    render(() => (
      <Button class="primary" data-testid="save" style={{ color: "red" }}>
        Save
      </Button>
    ));
    const button = screen.getByTestId("save");

    expect(button.getAttribute("class")).toBe("primary");
    expect(button.style.color).toBe("red");
  });

  test("an icon-only button needs a label, and the check says so", () => {
    render(() => (
      <>
        <Button aria-label="Close">x</Button>
      </>
    ));
    expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
    expectNoAriaViolations(screen.getByRole("button").parentElement as Element);
  });

  test("type submit reaches the form", () => {
    const submits: string[] = [];
    render(() => (
      <form
        onSubmit={(e: SubmitEvent) => {
          e.preventDefault();
          submits.push("submit");
        }}
      >
        <Button type="submit">Go</Button>
      </form>
    ));

    expect(screen.getByRole<HTMLButtonElement>("button").type).toBe("submit");
  });
});

describe("ToggleButton", () => {
  test("announces its state with aria-pressed", () => {
    render(() => <ToggleButton>Bold</ToggleButton>);
    const button = screen.getByRole("button");

    expect(button.getAttribute("aria-pressed")).toBe("false");

    user.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.hasAttribute("data-selected")).toBe(true);

    user.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  test("controlled: the prop owns the state", () => {
    const selected = signal(false);
    const changes: boolean[] = [];
    render(() => (
      <ToggleButton isSelected={selected()} onChange={(on) => changes.push(on)}>
        Bold
      </ToggleButton>
    ));
    const button = screen.getByRole("button");

    user.click(button);
    expect(changes).toEqual([true]);
    expect(button.getAttribute("aria-pressed")).toBe("false");

    selected.set(true);
    flush();
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  test("defaultSelected starts on", () => {
    render(() => <ToggleButton defaultSelected>Bold</ToggleButton>);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });
});
