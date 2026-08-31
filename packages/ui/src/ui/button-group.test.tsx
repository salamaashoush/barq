import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Button } from "./button.tsx";
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  buttonGroupVariants,
} from "./button-group.tsx";

function slot(name: string): HTMLElement {
  const found = document.querySelector(`[data-slot="${name}"]`);
  if (found === null) throw new Error(`no [data-slot="${name}"]`);
  return found as HTMLElement;
}

describe("ButtonGroup", () => {
  test("it is a group of buttons a reader can count", () => {
    render(() => (
      <ButtonGroup aria-label="Range">
        <Button variant="outline">Day</Button>
        <Button variant="outline">Week</Button>
      </ButtonGroup>
    ));
    expect(screen.getByRole("group", { name: "Range" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  test("horizontal is the default, and it squares the inner corners", () => {
    render(() => (
      <ButtonGroup>
        <Button>a</Button>
      </ButtonGroup>
    ));
    expect(slot("button-group").getAttribute("data-orientation")).toBe("horizontal");

    const rules = rulesFor(slot("button-group").className);
    expect(rules).toContain("> :not(:first-child){border-top-left-radius: 0");
    expect(rules).toContain("border-left-width: 0px");
  });

  test("vertical squares the top and bottom instead", () => {
    const vertical = buttonGroupVariants({ orientation: "vertical" });
    const rules = rulesFor(vertical);
    expect(rules).toContain("flex-direction: column");
    expect(rules).toContain("border-top-width: 0px");
  });

  test("the seam is drawn on any child, not only on a Button", () => {
    // shadcn's rule is `[&>*:not(:first-child)]`, which is what lets a Select
    // trigger, an Input and a ButtonGroupText join the same welded row.
    const base = buttonGroupVariants();
    expect(rulesFor(base)).toContain("> :not(:first-child)");
  });

  test("a text segment carries the muted border the buttons meet", () => {
    render(() => (
      <ButtonGroup>
        <ButtonGroupText>https://</ButtonGroupText>
        <Button>Go</Button>
      </ButtonGroup>
    ));
    const text = slot("button-group-text");
    expect(text.textContent).toBe("https://");
    expect(rulesFor(text.className)).toContain("background-color: var(--muted)");
  });

  test("the separator is vertical by default and answers to its own slot", () => {
    render(() => (
      <ButtonGroup>
        <Button>a</Button>
        <ButtonGroupSeparator />
        <Button>b</Button>
      </ButtonGroup>
    ));
    const separator = slot("button-group-separator");
    expect(separator.getAttribute("data-orientation")).toBe("vertical");
    expect(document.querySelector('[data-slot="separator"]')).toBeNull();
  });

  test("a caller's class survives on the separator", () => {
    render(() => <ButtonGroupSeparator class="mine" />);
    expect(slot("button-group-separator").className.split(" ")).toContain("mine");
  });
});
