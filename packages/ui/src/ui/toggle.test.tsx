import { describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Toggle, toggleVariants } from "./toggle.tsx";

const bold = (): HTMLElement => screen.getByRole("button", { name: "Bold" });

describe("Toggle", () => {
  test("it carries its slot and says on or off as well as pressed", async () => {
    render(() => <Toggle aria-label="Bold">B</Toggle>);
    expect(bold().getAttribute("data-slot")).toBe("toggle");
    expect(bold().getAttribute("data-state")).toBe("off");
    expect(bold().getAttribute("aria-pressed")).toBe("false");

    await user.click(bold());
    flush();
    expect(bold().getAttribute("data-state")).toBe("on");
    expect(bold().getAttribute("aria-pressed")).toBe("true");
    expect(bold().hasAttribute("data-selected")).toBe(true);
  });

  test("Space and Enter toggle it from the keyboard", () => {
    render(() => <Toggle aria-label="Bold">B</Toggle>);
    user.tab();
    expect(document.activeElement).toBe(bold());
    user.key(" ");
    flush();
    expect(bold().getAttribute("aria-pressed")).toBe("true");
    user.key("Enter");
    flush();
    expect(bold().getAttribute("aria-pressed")).toBe("false");
  });

  test("defaultPressed starts it on", () => {
    render(() => (
      <Toggle aria-label="Bold" defaultPressed>
        B
      </Toggle>
    ));
    expect(bold().getAttribute("aria-pressed")).toBe("true");
    expect(bold().getAttribute("data-state")).toBe("on");
  });

  test("pressed controls it, and onPressedChange reports the press", async () => {
    const [pressed, setPressed] = createSignal(false);
    const seen: boolean[] = [];
    render(() => (
      <Toggle aria-label="Bold" pressed={pressed()} onPressedChange={(next) => seen.push(next)}>
        B
      </Toggle>
    ));
    await user.click(bold());
    flush();
    expect(seen).toEqual([true]);
    expect(bold().getAttribute("aria-pressed")).toBe("false");

    setPressed(true);
    flush();
    expect(bold().getAttribute("aria-pressed")).toBe("true");
    expect(bold().getAttribute("data-state")).toBe("on");
  });

  test("onChange and onPressedChange are both told", async () => {
    const seen: string[] = [];
    render(() => (
      <Toggle
        aria-label="Bold"
        onChange={(next) => seen.push(`change:${String(next)}`)}
        onPressedChange={(next) => seen.push(`pressed:${String(next)}`)}
      >
        B
      </Toggle>
    ));
    await user.click(bold());
    expect(seen).toEqual(["change:true", "pressed:true"]);
  });

  test("disabled is the platform's, and says so for a style too", async () => {
    const seen: boolean[] = [];
    render(() => (
      <Toggle aria-label="Bold" disabled onPressedChange={(next) => seen.push(next)}>
        B
      </Toggle>
    ));
    expect(bold().hasAttribute("disabled")).toBe(true);
    expect(bold().hasAttribute("data-disabled")).toBe(true);
    await user.click(bold());
    expect(seen).toEqual([]);
  });

  test("the aliases are props, not attributes", () => {
    render(() => (
      <Toggle aria-label="Bold" pressed variant="outline" size="sm">
        B
      </Toggle>
    ));
    expect(bold().hasAttribute("pressed")).toBe(false);
    expect(bold().hasAttribute("variant")).toBe(false);
    expect(bold().hasAttribute("size")).toBe(false);
    expect(bold().getAttribute("data-variant")).toBe("outline");
    expect(bold().getAttribute("data-size")).toBe("sm");
  });

  test("the icon padding is logical, so it follows the reading direction", () => {
    for (const size of ["default", "sm", "lg"] as const) {
      const rules = rulesFor(toggleVariants({ size }) ?? "");
      expect(rules).toContain("padding-inline-end");
      expect(rules).toContain("padding-inline-start");
      expect(rules).not.toContain("padding-left");
      expect(rules).not.toContain("padding-right");
    }
  });
});
