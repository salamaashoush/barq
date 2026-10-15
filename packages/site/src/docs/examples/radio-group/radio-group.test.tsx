import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import RadioGroupChoiceCard from "./radio-group-choice-card.tsx";
import RadioGroupDemo from "./radio-group-demo.tsx";
import RadioGroupDisabled from "./radio-group-disabled.tsx";
import RadioGroupInvalid from "./radio-group-invalid.tsx";
import RadioGroupRtl from "./radio-group-rtl.tsx";

const radio = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
const chosen = (): string[] =>
  screen
    .getAllByRole<HTMLInputElement>("radio")
    .filter((one) => one.checked)
    .map((one) => one.value);

describe("the radio group examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("radio-group")).toEqual([]);
  });

  test("a press on a radio and a press on a label each move the choice", async () => {
    render(() => <RadioGroupDemo />);
    expect(chosen()).toEqual(["comfortable"]);

    await user.click(radio("radio-group-demo-r1"));
    flush();
    expect(chosen()).toEqual(["default"]);

    await user.click(document.querySelector('label[for="radio-group-demo-r3"]') as HTMLElement);
    flush();
    expect(chosen()).toEqual(["compact"]);
  });

  test("a press anywhere on a card chooses its plan", async () => {
    render(() => <RadioGroupChoiceCard />);
    expect(chosen()).toEqual(["plus"]);

    const titles = document.querySelectorAll<HTMLElement>('[data-slot="field-title"]');
    await user.click(titles[2] as HTMLElement);
    flush();
    expect(chosen()).toEqual(["enterprise"]);
    expect(
      document
        .querySelector('label[for="radio-group-choice-card-enterprise"]')
        ?.querySelector("[data-selected]"),
    ).not.toBeNull();
  });

  test("the disabled radio cannot be chosen", async () => {
    render(() => <RadioGroupDisabled />);
    expect(radio("radio-group-disabled-1").disabled).toBe(true);
    await user.click(radio("radio-group-disabled-1"));
    flush();
    expect(chosen()).toEqual(["option2"]);
  });

  test("the invalid group is announced as invalid and every field is marked", () => {
    render(() => <RadioGroupInvalid />);
    expect(screen.getByRole("radiogroup").getAttribute("aria-invalid")).toBe("true");
    expect(document.querySelectorAll('[data-slot="field"][data-invalid]')).toHaveLength(3);
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <RadioGroupRtl />);
    expect(document.querySelector('[dir="rtl"] [data-slot="radio-group"]')).not.toBeNull();
    expect(chosen()).toEqual(["comfortable"]);
  });
});
