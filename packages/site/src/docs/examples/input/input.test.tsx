import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import InputButtonGroup from "./input-button-group.tsx";
import InputDemo from "./input-demo.tsx";
import InputDisabled from "./input-disabled.tsx";
import InputForm from "./input-form.tsx";
import InputInputGroup from "./input-input-group.tsx";
import InputInvalid from "./input-invalid.tsx";
import InputReadOnly from "./input-read-only.tsx";
import InputRtl from "./input-rtl.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("the input examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("input")).toEqual([]);
  });

  test("the label names the input, and typing reaches its value", async () => {
    render(() => <InputDemo />);
    const input = screen.getByLabelText("API Key") as HTMLInputElement;
    expect(input.type).toBe("password");

    await user.type(input, "sk-123");
    flush();
    expect(input.value).toBe("sk-123");
  });

  test("a disabled input is disabled and its field says so", () => {
    render(() => <InputDisabled />);
    const input = screen.getByLabelText("Email") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.closest('[data-slot="field"]')?.hasAttribute("data-disabled")).toBe(true);
  });

  test("an invalid input announces it and its field carries the state", () => {
    render(() => <InputInvalid />);
    const input = screen.getByLabelText("Invalid Input");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.closest('[data-slot="field"]')?.hasAttribute("data-invalid")).toBe(true);
  });

  test("a read-only input keeps its value against typing", async () => {
    render(() => <InputReadOnly />);
    const input = screen.getByLabelText("Invite link") as HTMLInputElement;
    expect(input.readOnly).toBe(true);
    expect(input.value).toBe("https://example.com/invite/salama");
  });

  test("the input inside a group is the group's control", () => {
    render(() => <InputInputGroup />);
    const input = screen.getByLabelText("Website URL");
    expect(input.getAttribute("data-slot")).toBe("input-group-control");
    expect(document.querySelectorAll('[data-slot="input-group-addon"]')).toHaveLength(2);
  });

  test("the input and the button share one button group", () => {
    render(() => <InputButtonGroup />);
    const group = screen.getByLabelText("Search").parentElement;
    expect(group?.getAttribute("data-slot")).toBe("button-group");
    expect(group?.contains(screen.getByRole("button", { name: "Search" }))).toBe(true);
  });

  test("the form's country select opens on its three countries and takes a choice", async () => {
    render(() => <InputForm />);
    await settle();
    const trigger = screen.getByRole("combobox", { name: "Country" });
    expect(trigger.textContent).toBe("United States");

    await user.click(trigger);
    await settle();
    expect(screen.getAllByRole("option")).toHaveLength(3);

    await user.click(screen.getByRole("option", { name: "Canada" }));
    await settle();
    expect(trigger.textContent).toBe("Canada");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <InputRtl />);
    expect(document.querySelector('[dir="rtl"] [data-slot="input"]')).not.toBeNull();
    expect(screen.getByLabelText("مفتاح API")).not.toBeNull();
  });
});
