import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import SwitchChoiceCard from "./switch-choice-card.tsx";
import SwitchDemo from "./switch-demo.tsx";
import SwitchDisabled from "./switch-disabled.tsx";
import SwitchInvalid from "./switch-invalid.tsx";
import SwitchRtl from "./switch-rtl.tsx";
import SwitchSizes from "./switch-sizes.tsx";

const control = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
const tracks = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('span[data-slot="switch"]'),
];

describe("the switch examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("switch")).toEqual([]);
  });

  test("a press on the track and a press on the label each flip it once", async () => {
    render(() => <SwitchDemo />);
    expect(control("switch-demo-airplane-mode").checked).toBe(false);

    await user.click(tracks()[0] as HTMLElement);
    flush();
    expect(control("switch-demo-airplane-mode").checked).toBe(true);
    expect(tracks()[0]?.getAttribute("data-state")).toBe("checked");

    await user.click(
      document.querySelector('label[for="switch-demo-airplane-mode"]') as HTMLElement,
    );
    flush();
    expect(control("switch-demo-airplane-mode").checked).toBe(false);
  });

  test("a press on a card's title flips the switch in that card only", async () => {
    render(() => <SwitchChoiceCard />);
    expect(control("switch-choice-card-share").checked).toBe(false);
    expect(control("switch-choice-card-notifications").checked).toBe(true);

    await user.click(document.querySelector('[data-slot="field-title"]') as HTMLElement);
    flush();
    expect(control("switch-choice-card-share").checked).toBe(true);
    expect(control("switch-choice-card-notifications").checked).toBe(true);
  });

  test("the disabled switch stays off", async () => {
    render(() => <SwitchDisabled />);
    expect(control("switch-disabled-unchecked").disabled).toBe(true);
    await user.click(tracks()[0] as HTMLElement);
    flush();
    expect(control("switch-disabled-unchecked").checked).toBe(false);
  });

  test("the invalid switch is announced as invalid and its field is marked", () => {
    render(() => <SwitchInvalid />);
    expect(control("switch-invalid-terms").getAttribute("aria-invalid")).toBe("true");
    expect(tracks()[0]?.hasAttribute("data-invalid")).toBe(true);
    expect(document.querySelector('[data-slot="field"]')?.hasAttribute("data-invalid")).toBe(true);
  });

  test("each size is named on its track", () => {
    render(() => <SwitchSizes />);
    expect(tracks().map((track) => track.getAttribute("data-size"))).toEqual(["sm", "default"]);
  });

  test("the right-to-left example names its direction on an element", async () => {
    render(() => <SwitchRtl />);
    expect(document.querySelector('[dir="rtl"] span[data-slot="switch"]')).not.toBeNull();
    await user.click(tracks()[0] as HTMLElement);
    flush();
    expect(control("switch-rtl-focus-mode").checked).toBe(true);
  });
});
