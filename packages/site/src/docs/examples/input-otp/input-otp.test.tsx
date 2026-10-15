import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import InputOTPControlled from "./input-otp-controlled.tsx";
import InputOTPDemo from "./input-otp-demo.tsx";
import InputOTPDisabled from "./input-otp-disabled.tsx";
import InputOTPFourDigits from "./input-otp-four-digits.tsx";
import InputOTPRtl from "./input-otp-rtl.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const boxes = (): string[] =>
  [...document.querySelectorAll('[data-slot="input-otp-slot"]')].map(
    (slot) => slot.textContent ?? "",
  );

describe("the input OTP examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("input-otp")).toEqual([]);
  });

  test("the default value is drawn one character a box", () => {
    render(() => <InputOTPDemo />);
    expect(boxes()).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  test("what is typed is what the controlled caption reads", async () => {
    render(() => <InputOTPControlled />);
    expect(screen.getByText("Enter your one-time password.")).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: "One-time password" }), "4821");
    await settle();
    expect(screen.getByText("You entered: 4821")).toBeTruthy();
    expect(boxes().slice(0, 4)).toEqual(["4", "8", "2", "1"]);
  });

  test("a digits-only pattern refuses a letter", async () => {
    render(() => <InputOTPFourDigits />);
    const field = screen.getByRole<HTMLInputElement>("textbox", { name: "PIN" });
    await user.type(field, "7a");
    await settle();
    expect(field.value).toBe("7");
  });

  test("a disabled field cannot be typed in", () => {
    render(() => <InputOTPDisabled />);
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "One-time password" }).disabled,
    ).toBe(true);
    expect(document.querySelectorAll('[data-slot="input-otp-separator"]')).toHaveLength(1);
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <InputOTPRtl />);
    expect(document.querySelectorAll('[dir="rtl"] [data-slot="input-otp-slot"]')).toHaveLength(6);
    expect(screen.getByLabelText("رمز التحقق").tagName).toBe("INPUT");
  });
});
