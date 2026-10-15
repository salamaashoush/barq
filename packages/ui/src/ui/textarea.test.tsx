import { describe, expect, test } from "bun:test";
import { render, screen, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Textarea as FromInput } from "./input.tsx";
import { Textarea } from "./textarea.tsx";

describe("Textarea", () => {
  test("it is a textarea a reader can name, under its own slot", () => {
    render(() => <Textarea aria-label="Notes" />);
    const field = screen.getByRole("textbox", { name: "Notes" });
    expect(field.tagName).toBe("TEXTAREA");
    expect(field.getAttribute("data-slot")).toBe("textarea");
  });

  test("the control's own attributes reach the element", () => {
    render(() => (
      <Textarea
        aria-label="Notes"
        name="notes"
        placeholder="Anything else?"
        rows={4}
        maxLength={280}
        required
        aria-invalid="true"
      />
    ));
    const field = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    expect(field.name).toBe("notes");
    expect(field.placeholder).toBe("Anything else?");
    expect(field.getAttribute("rows")).toBe("4");
    expect(field.getAttribute("maxlength")).toBe("280");
    expect(field.required).toBe(true);
    expect(field.getAttribute("aria-invalid")).toBe("true");
  });

  test("typing reports each change", async () => {
    const seen: string[] = [];
    render(() => (
      <Textarea
        aria-label="Notes"
        onInput={(event) => seen.push((event.target as HTMLTextAreaElement).value)}
      />
    ));
    await user.type(screen.getByLabelText("Notes"), "hi");
    expect(seen).toEqual(["h", "hi"]);
  });

  test("disabled is the element's own state, not a look", async () => {
    const seen: string[] = [];
    render(() => <Textarea aria-label="Notes" disabled onInput={() => seen.push("input")} />);
    const field = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    expect(field.disabled).toBe(true);
    await user.type(field, "x");
    expect(seen).toEqual([]);
  });

  test("it grows with what is typed, with no observer to do it", () => {
    render(() => <Textarea aria-label="Notes" />);
    const rules = rulesFor(screen.getByLabelText("Notes").className);
    expect(rules).toContain("field-sizing: content");
    expect(rules).toContain("min-height: calc(var(--spacing) * 16)");
  });

  test("a caller's class and ref both arrive", () => {
    const node: { current: HTMLTextAreaElement | null } = { current: null };
    render(() => <Textarea aria-label="Notes" class="mine" ref={node} />);
    const field = screen.getByLabelText("Notes");
    expect(field.className.split(" ")).toContain("mine");
    expect(node.current === field).toBe(true);
  });

  test("the input module still exports it, and it is the same component", () => {
    expect(FromInput).toBe(Textarea);
  });
});
