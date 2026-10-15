import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import TextareaButton from "./textarea-button.tsx";
import TextareaDisabled from "./textarea-disabled.tsx";
import TextareaField from "./textarea-field.tsx";
import TextareaInvalid from "./textarea-invalid.tsx";
import TextareaRtl from "./textarea-rtl.tsx";

describe("the textarea examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("textarea")).toEqual([]);
  });

  test("the label names the textarea, and typing reaches its value", async () => {
    render(() => <TextareaField />);
    const textarea = screen.getByLabelText("Message") as HTMLTextAreaElement;
    expect(textarea.tagName).toBe("TEXTAREA");

    await user.type(textarea, "Hello there");
    flush();
    expect(textarea.value).toBe("Hello there");
  });

  test("a disabled textarea is disabled and its field says so", () => {
    render(() => <TextareaDisabled />);
    const textarea = screen.getByLabelText("Message") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    expect(textarea.closest('[data-slot="field"]')?.hasAttribute("data-disabled")).toBe(true);
  });

  test("an invalid textarea announces it and its field carries the state", () => {
    render(() => <TextareaInvalid />);
    const textarea = screen.getByLabelText("Message");
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
    expect(textarea.closest('[data-slot="field"]')?.hasAttribute("data-invalid")).toBe(true);
  });

  test("the textarea sits above its send button", () => {
    render(() => <TextareaButton />);
    const textarea = screen.getByPlaceholderText("Type your message here.");
    const button = screen.getByRole("button", { name: "Send message" });
    expect(textarea.nextElementSibling).toBe(button);
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <TextareaRtl />);
    const textarea = screen.getByLabelText("التعليقات") as HTMLTextAreaElement;
    expect(textarea.closest('[dir="rtl"]')).not.toBeNull();
    expect(textarea.getAttribute("rows")).toBe("4");
  });
});
