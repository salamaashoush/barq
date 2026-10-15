import { describe, expect, test } from "bun:test";
import { render, screen, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Input } from "./input.tsx";

describe("Input density", () => {
  test("the default is the height it always was", () => {
    render(() => <Input aria-label="Name" />);
    expect(screen.getByLabelText("Name").getAttribute("data-size")).toBe("default");
  });

  test("sm says so where the CSS can read it", () => {
    render(() => <Input size="sm" aria-label="X" />);
    expect(screen.getByLabelText("X").getAttribute("data-size")).toBe("sm");
  });

  test("the dense rule is the height NativeSelect's own sm is", () => {
    render(() => <Input size="sm" aria-label="Y" />);
    const rules = rulesFor(screen.getByLabelText("Y").className);
    expect(rules).toContain('[data-size="sm"]');
    expect(rules).toContain("calc(var(--spacing) * 7)");
  });

  test("the variant is not passed through as the attribute of the same name", () => {
    render(() => <Input size="sm" aria-label="Z" />);
    // `size` on an <input> means "how many characters wide", and forwarding the
    // variant would set it to a number nobody asked for.
    expect(screen.getByLabelText("Z").hasAttribute("size")).toBe(false);
  });
});

describe("Input, as a native input", () => {
  test("what an input takes reaches the element", async () => {
    const seen: string[] = [];
    render(() => (
      <Input
        aria-label="Code"
        enterKeyHint="done"
        autoCapitalize="characters"
        spellCheck={false}
        aria-required="true"
        onKeyUp={(event) => seen.push(`up:${event.key}`)}
        onPaste={() => seen.push("paste")}
      />
    ));
    const field = screen.getByLabelText("Code") as HTMLInputElement;
    expect(field.getAttribute("enterkeyhint")).toBe("done");
    expect(field.getAttribute("autocapitalize")).toBe("characters");
    expect(field.getAttribute("spellcheck")).toBe("false");
    expect(field.getAttribute("aria-required")).toBe("true");

    user.focus(field);
    user.key("a");
    field.dispatchEvent(new Event("paste", { bubbles: true }));
    expect(seen).toEqual(["up:a", "paste"]);
  });

  test("a checkbox input can be checked from the prop", () => {
    render(() => <Input type="checkbox" aria-label="Agree" checked />);
    expect(screen.getByLabelText<HTMLInputElement>("Agree").checked).toBe(true);
  });
});
