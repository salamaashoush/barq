import { afterEach, describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import {
  accessibleName,
  cleanup,
  expectNoAriaViolations,
  render,
  screen,
  user,
} from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "./field.tsx";
import { Label } from "./label.tsx";
import { Switch } from "./switch.tsx";

afterEach(cleanup);

const slot = (name: string): HTMLElement =>
  document.querySelector(`:not(input)[data-slot="${name}"]`) as HTMLElement;

describe("Switch", () => {
  test("the track and the thumb say checked or unchecked", async () => {
    render(() => <Switch aria-label="Wi-Fi" />);
    expect(slot("switch").getAttribute("data-state")).toBe("unchecked");
    expect(slot("switch-thumb").getAttribute("data-state")).toBe("unchecked");
    await user.click(screen.getByRole("switch"));
    flush();
    expect(slot("switch").getAttribute("data-state")).toBe("checked");
    expect(slot("switch-thumb").getAttribute("data-state")).toBe("checked");
  });

  test("defaultChecked starts it on and onCheckedChange hears it go off", async () => {
    const seen: boolean[] = [];
    render(() => (
      <Switch aria-label="Wi-Fi" defaultChecked onCheckedChange={(on) => seen.push(on)} />
    ));
    const control = screen.getByRole("switch") as HTMLInputElement;
    expect(control.checked).toBe(true);
    await user.click(control);
    flush();
    expect(seen).toEqual([false]);
    expect(control.checked).toBe(false);
  });

  test("checked is the owner's to change", async () => {
    const [on, setOn] = createSignal(false);
    const asked: boolean[] = [];
    render(() => (
      <Switch aria-label="Wi-Fi" checked={on()} onCheckedChange={(next) => asked.push(next)} />
    ));
    const control = screen.getByRole("switch") as HTMLInputElement;
    await user.click(control);
    flush();
    expect(asked).toEqual([true]);
    expect(slot("switch").getAttribute("data-state")).toBe("unchecked");
    setOn(true);
    flush();
    expect(slot("switch").getAttribute("data-state")).toBe("checked");
  });

  test("disabled reaches the input and marks the track and the thumb", () => {
    render(() => <Switch aria-label="Wi-Fi" disabled />);
    const input = screen.getByRole("switch") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(slot("switch").getAttribute("data-disabled")).toBe("");
    expect(slot("switch-thumb").getAttribute("data-disabled")).toBe("");
  });

  test("required reaches the input", () => {
    render(() => <Switch aria-label="Terms" required />);
    expect(screen.getByRole("switch").getAttribute("aria-required")).toBe("true");
  });

  test("right to left, the thumb travels the other way", () => {
    render(() => <Switch aria-label="Wi-Fi" />);
    const rules = rulesFor(slot("switch-thumb").className);
    expect(rules).toContain(":dir(rtl)");
    expect(rules).toContain("--ui-translate-x: calc((100% - 2px) * -1)");
  });
});

describe("Switch, inside a label that is not its own", () => {
  const control = (): HTMLInputElement => screen.getByRole("switch") as HTMLInputElement;

  test("it renders no label, so the caller's is the only one", () => {
    render(() => (
      <label>
        Wi-Fi <Switch />
      </label>
    ));
    expect(document.querySelectorAll("label")).toHaveLength(1);
    expect(slot("switch").tagName).toBe("SPAN");
    expect(accessibleName(control())).toBe("Wi-Fi");
  });

  test("a press on the text, on the track or on the thumb toggles it once each", async () => {
    const seen: boolean[] = [];
    render(() => (
      <label>
        <span data-testid="text">Wi-Fi</span>
        <Switch onCheckedChange={(on) => seen.push(on)} />
      </label>
    ));
    await user.click(screen.getByTestId("text"));
    flush();
    expect(seen).toEqual([true]);
    await user.click(slot("switch"));
    flush();
    expect(seen).toEqual([true, false]);
    await user.click(slot("switch-thumb"));
    flush();
    expect(seen).toEqual([true, false, true]);
    expect(slot("switch").getAttribute("data-state")).toBe("checked");
  });

  test("the keyboard's activation toggles it once", () => {
    const seen: boolean[] = [];
    render(() => (
      <label>
        Wi-Fi <Switch onCheckedChange={(on) => seen.push(on)} />
      </label>
    ));
    control().focus();
    // What the platform does for Space on a focused checkbox.
    control().click();
    flush();
    expect(seen).toEqual([true]);
  });

  test("in a field row whose label wraps the row, there is still one label", async () => {
    const seen: boolean[] = [];
    const { container } = render(() => (
      <FieldLabel>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Share across devices</FieldTitle>
            <FieldDescription>Focus is shared across devices.</FieldDescription>
          </FieldContent>
          <Switch onCheckedChange={(on) => seen.push(on)} />
        </Field>
      </FieldLabel>
    ));
    expect(document.querySelectorAll("label")).toHaveLength(1);
    expect(accessibleName(control())).toContain("Share across devices");

    await user.click(document.querySelector('[data-slot="field-title"]') as HTMLElement);
    flush();
    expect(seen).toEqual([true]);
    await user.click(slot("switch"));
    flush();
    expect(seen).toEqual([true, false]);
    control().click();
    flush();
    expect(seen).toEqual([true, false, true]);
    expectNoAriaViolations(container);
  });

  test("in a field row with the label beside it, the label reaches it by id", async () => {
    const seen: boolean[] = [];
    render(() => (
      <Field orientation="horizontal">
        <FieldLabel for="2fa">Multi-factor authentication</FieldLabel>
        <Switch id="2fa" onCheckedChange={(on) => seen.push(on)} />
      </Field>
    ));
    expect(document.querySelectorAll("label")).toHaveLength(1);
    expect(accessibleName(control())).toBe("Multi-factor authentication");
    await user.click(document.querySelector("label") as HTMLElement);
    flush();
    expect(seen).toEqual([true]);
  });

  test("on its own, beside a label, a press on the track still toggles it and takes focus", async () => {
    const seen: boolean[] = [];
    render(() => (
      <>
        <Switch id="wifi" onCheckedChange={(on) => seen.push(on)} />
        <Label for="wifi">Wi-Fi</Label>
      </>
    ));
    await user.click(slot("switch"));
    flush();
    expect(seen).toEqual([true]);
    expect(document.activeElement).toBe(control());
  });
});
