import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";
import { Button } from "./button.tsx";
import { Toolbar } from "./toolbar.tsx";

function Formatting() {
  return (
    <Toolbar aria-label="Formatting">
      <Button>Bold</Button>
      <Button>Italic</Button>
      <Button>Underline</Button>
    </Toolbar>
  );
}

function buttons(): HTMLElement[] {
  return screen.getAllByRole("button");
}

describe("Toolbar", () => {
  test("is a named toolbar with an orientation", () => {
    render(() => <Formatting />);

    const bar = screen.getByRole("toolbar");
    expect(accessibleName(bar)).toBe("Formatting");
    expect(bar.getAttribute("aria-orientation")).toBe("horizontal");
  });

  test("the arrows move between the controls", () => {
    render(() => <Formatting />);

    const controls = buttons();
    user.focus(controls[0] as HTMLElement);

    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(controls[1] as HTMLElement);

    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(controls[2] as HTMLElement);

    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement).toBe(controls[1] as HTMLElement);
  });

  test("a vertical toolbar uses the vertical arrows", () => {
    render(() => (
      <Toolbar aria-label="Tools" orientation="vertical">
        <Button>One</Button>
        <Button>Two</Button>
      </Toolbar>
    ));

    const controls = buttons();
    user.focus(controls[0] as HTMLElement);

    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(controls[1] as HTMLElement);

    user.keyDown("ArrowUp");
    flush();
    expect(document.activeElement).toBe(controls[0] as HTMLElement);
  });

  test("Tab moves to the last control so the browser leaves the toolbar", () => {
    render(() => <Formatting />);

    const controls = buttons();
    user.focus(controls[0] as HTMLElement);

    user.keyDown("Tab");
    flush();

    // The browser's own Tab continues from HERE, which is past the toolbar.
    expect(document.activeElement).toBe(controls[2] as HTMLElement);
  });

  test("Shift+Tab moves to the first, so the browser leaves backwards", () => {
    render(() => <Formatting />);

    const controls = buttons();
    user.focus(controls[2] as HTMLElement);

    user.keyDown("Tab", { shiftKey: true });
    flush();

    expect(document.activeElement).toBe(controls[0] as HTMLElement);
  });

  test("a nested toolbar leaves the arrows to the outer one", () => {
    render(() => (
      <Toolbar aria-label="Outer">
        <Button>One</Button>
        <Toolbar aria-label="Inner">
          <Button>Two</Button>
          <Button>Three</Button>
        </Toolbar>
      </Toolbar>
    ));
    flush();

    const controls = buttons();
    user.focus(controls[1] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();

    // Moved exactly once: two handlers on one key would land on "One".
    expect(document.activeElement).toBe(controls[2] as HTMLElement);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Formatting />);
    expectNoAriaViolations(container);
  });
});
