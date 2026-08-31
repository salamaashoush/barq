import { describe, expect, test } from "bun:test";
import { collectCss } from "@barqjs/css";
import { render, screen, user } from "@barqjs/testing";

import {
  InputGroup,
  InputGroupAddon,
  inputGroupAddonVariants,
  InputGroupButton,
  inputGroupButtonVariants,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "./input-group.tsx";

function rulesFor(className: string): string {
  const mentions = new RegExp(`\\.${className}(?![\\w-])`);
  return collectCss()
    .split("@layer barq.ui{")
    .filter((chunk) => mentions.test(chunk))
    .join("\n");
}

function slot(name: string): HTMLElement {
  const found = document.querySelector(`[data-slot="${name}"]`);
  if (found === null) throw new Error(`no [data-slot="${name}"]`);
  return found as HTMLElement;
}

describe("InputGroup", () => {
  test("the control keeps its own role and the group wraps it", () => {
    render(() => (
      <InputGroup>
        <InputGroupAddon>@</InputGroupAddon>
        <InputGroupInput aria-label="Handle" />
      </InputGroup>
    ));
    expect(screen.getByRole("textbox", { name: "Handle" })).toBeTruthy();
    expect(slot("input-group").getAttribute("role")).toBe("group");
  });

  test("the control is marked so the group's ring can find it", () => {
    render(() => <InputGroupInput aria-label="Handle" />);
    const control = slot("input-group-control");
    expect(control.tagName).toBe("INPUT");
    // The `<Input>`'s own slot would have made `:has([data-slot=input-group-control])`
    // match nothing, and the group would never have shown focus.
    expect(document.querySelector('[data-slot="input"]')).toBeNull();
  });

  test("the ring is the group's, keyed off the control's focus", () => {
    render(() => (
      <InputGroup>
        <InputGroupInput aria-label="Handle" />
      </InputGroup>
    ));
    const rules = slot("input-group").className.split(" ").map(rulesFor).join("");
    expect(rules).toContain(':has(:is([data-slot="input-group-control"]:focus-visible))');
  });

  test("the control draws no border of its own", () => {
    render(() => <InputGroupInput aria-label="Handle" />);
    const classes = slot("input-group-control").className.split(" ");
    expect(classes.map(rulesFor).join("")).toContain("border-width: 0px");
  });

  test("a textarea makes the group grow", () => {
    render(() => (
      <InputGroup>
        <InputGroupTextarea aria-label="Notes" />
      </InputGroup>
    ));
    expect(slot("input-group-control").tagName).toBe("TEXTAREA");
    const rules = slot("input-group").className.split(" ").map(rulesFor).join("");
    expect(rules).toContain("> textarea){height: auto}");
  });

  test("placeholder and input reach the control", async () => {
    const typed: string[] = [];
    render(() => (
      <InputGroup>
        <InputGroupInput
          aria-label="Handle"
          placeholder="you"
          onInput={(event) => typed.push((event.target as HTMLInputElement).value)}
        />
      </InputGroup>
    ));
    const control = screen.getByRole("textbox", { name: "Handle" }) as HTMLInputElement;
    expect(control.placeholder).toBe("you");
    await user.type(control, "ab");
    expect(typed.at(-1)).toBe("ab");
  });

  test("an addon says which edge it is on, and the group's padding rule reads it", () => {
    render(() => (
      <InputGroup>
        <InputGroupInput aria-label="Handle" />
        <InputGroupAddon align="inline-end">.com</InputGroupAddon>
      </InputGroup>
    ));
    const addon = slot("input-group-addon");
    expect(addon.getAttribute("data-align")).toBe("inline-end");

    const rules = slot("input-group").className.split(" ").map(rulesFor).join("");
    expect(rules).toContain('> [data-align="inline-end"]) > input');
  });

  test("inline-start is the default and it comes first in the flex order", () => {
    render(() => <InputGroupAddon>@</InputGroupAddon>);
    expect(slot("input-group-addon").getAttribute("data-align")).toBe("inline-start");
    const start = inputGroupAddonVariants().split(" ").at(-1) ?? "";
    expect(rulesFor(start)).toContain("order: -9999");
  });

  test("a block addon takes a row of its own", () => {
    const block = inputGroupAddonVariants({ align: "block-start" }).split(" ").at(-1) ?? "";
    expect(rulesFor(block)).toContain("width: 100%");
  });

  test("pressing the addon's padding focuses the control", () => {
    render(() => (
      <InputGroup>
        <InputGroupAddon>@</InputGroupAddon>
        <InputGroupInput aria-label="Handle" />
      </InputGroup>
    ));
    slot("input-group-addon").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Handle" }));
  });

  test("pressing a button inside the addon does not steal its press", async () => {
    const presses: string[] = [];
    render(() => (
      <InputGroup>
        <InputGroupInput aria-label="Handle" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton onPress={() => presses.push("clear")}>Clear</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    ));
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(presses).toEqual(["clear"]);
    expect(document.activeElement).not.toBe(screen.getByRole("textbox", { name: "Handle" }));
  });

  test("the button is a Button under another name, ghost and extra small", () => {
    render(() => <InputGroupButton>Clear</InputGroupButton>);
    const button = slot("input-group-button");
    expect(button.getAttribute("data-variant")).toBe("ghost");
    expect(button.getAttribute("data-size")).toBe("xs");
    const xs = inputGroupButtonVariants().split(" ").at(-1) ?? "";
    expect(rulesFor(xs)).toContain("height: calc(var(--spacing) * 6)");
  });

  test("a caller's own class still wins over both class lists", () => {
    render(() => <InputGroupButton class="mine">Clear</InputGroupButton>);
    expect(slot("input-group-button").className.split(" ")).toContain("mine");
  });

  test("text inside the border is muted and not a control", () => {
    render(() => <InputGroupText>USD</InputGroupText>);
    const text = slot("input-group-text");
    expect(text.tagName).toBe("SPAN");
    expect(rulesFor(text.className.split(" ")[0] ?? "")).toContain(
      "color: var(--muted-foreground)",
    );
  });

  test("disabled dims the addons through the group", () => {
    render(() => (
      <InputGroup isDisabled>
        <InputGroupAddon>@</InputGroupAddon>
      </InputGroup>
    ));
    expect(slot("input-group").getAttribute("data-disabled")).toBe("");
    const base = inputGroupAddonVariants().split(" ")[0] ?? "";
    expect(rulesFor(base)).toContain('[data-slot="input-group"][data-disabled] .');
  });
});
