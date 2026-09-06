import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

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
