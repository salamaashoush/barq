import { describe, expect, test } from "bun:test";
import { createSignal, type ParentProps } from "@barqjs/core";
import { collectCss } from "@barqjs/css";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user, within } from "@barqjs/testing";

import { target } from "../style/index.ts";
import { hydrates, settle, wears } from "../test-arc.ts";
import { type StepItem, Stepper, stepperStyles } from "./stepper.tsx";

const STEPS: StepItem[] = [
  { id: "upload", label: "Upload", description: "A CSV file" },
  { id: "map", label: "Map columns" },
  { id: "review", label: "Review", optional: true },
  { id: "done", label: "Finish" },
];

function slot(name: string): HTMLElement {
  return document.querySelector(`[data-slot="${name}"]`) as HTMLElement;
}

function steps(): HTMLElement[] {
  return [...document.querySelectorAll('[data-slot="stepper-step"]')] as HTMLElement[];
}

describe("Stepper", () => {
  test("a list of step links, each named by its number, state and label", async () => {
    render(() => (
      <Stepper
        aria-label="Import"
        items={STEPS}
        defaultSelectedKey="map"
        defaultLastCompletedStep="upload"
      />
    ));
    const list = screen.getByRole("list", { name: "Import" });
    const links = within(list).getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(links[0]?.getAttribute("aria-current")).toBeNull();
    expect(links[1]?.getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("link", { name: /^1\s*Completed: \s*Upload$/ })).toBeDefined();
    expect(screen.getByRole("link", { name: /^2\s*Current: \s*Map columns$/ })).toBeDefined();
    expect(steps().map((one) => one.getAttribute("data-state"))).toEqual([
      "completed",
      "current",
      "upcoming",
      "upcoming",
    ]);
    expect(steps()[0]?.querySelector("svg")).not.toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("only the steps done and the next can be reached; a press goes back", async () => {
    const [step, setStep] = createSignal("review");
    render(() => (
      <Stepper
        items={STEPS}
        selectedKey={step()}
        onSelectionChange={setStep}
        lastCompletedStep="map"
      />
    ));
    const last = screen.getAllByRole("link")[3] as HTMLElement;
    expect(last.getAttribute("aria-disabled")).toBe("true");
    user.click(last);
    await settle();
    expect(step()).toBe("review");
    user.tap(screen.getAllByRole("link")[0] as HTMLElement);
    await settle();
    expect(step()).toBe("upload");
  });

  test("Tab reaches each step that can be reached, and Enter opens it", async () => {
    const [step, setStep] = createSignal("map");
    render(() => (
      <Stepper
        items={STEPS}
        selectedKey={step()}
        onSelectionChange={setStep}
        lastCompletedStep="upload"
      />
    ));
    user.tab();
    expect(document.activeElement?.textContent).toContain("Upload");
    await user.keyboard("{Enter}");
    await settle();
    expect(step()).toBe("upload");
  });

  test("an invalid step says so in the danger tone, an optional one says it is optional", async () => {
    render(() => (
      <Stepper
        items={[
          { id: "a", label: "Details", invalid: true },
          { id: "b", label: "Extras", optional: true },
        ]}
        defaultSelectedKey="b"
        defaultLastCompletedStep="a"
      />
    ));
    const [invalid, optional] = screen.getAllByRole("link");
    expect(invalid?.getAttribute("aria-describedby")).not.toBeNull();
    const hint = document.getElementById(invalid?.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toBe("Has errors");
    const other = document.getElementById(optional?.getAttribute("aria-describedby") ?? "");
    expect(other?.textContent).toBe("Optional");
    expect(steps()[0]?.getAttribute("data-state")).toBe("invalid");
    expect(wears(steps()[0], stepperStyles({ state: "invalid" }).step)).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("vertical, and collapsing to the current label across a narrow container", () => {
    render(() => <Stepper items={STEPS} orientation="vertical" />);
    expect(slot("stepper").getAttribute("data-orientation")).toBe("vertical");
    expect(wears(slot("stepper-list"), stepperStyles({ orientation: "vertical" }).list)).toBe(true);
    const sheet = collectCss();
    expect(sheet).toMatch(/@container \(width < 32rem\)\{[^@]*\[data-step-description\]/);
    expect(wears(slot("stepper-link"), target.size)).toBe(true);
  });

  test("runs right to left with the locale's digits", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <Stepper items={STEPS} />
      </Arabic>
    ));
    expect(slot("stepper-marker").textContent).toBe("١");
    expect(collectCss()).toContain("margin-inline-start:calc(var(--spacing) * 4 - 1px)");
  });

  test("takes a class per part", () => {
    render(() => (
      <Stepper
        class="mine"
        items={[
          { id: "a", label: "A", description: "d", optional: true },
          { id: "b", label: "B" },
        ]}
        classes={{
          root: "r",
          list: "l",
          step: "s",
          link: "k",
          marker: "m",
          text: "t",
          label: "b",
          description: "d",
          optional: "o",
          connector: "c",
          hint: "h",
        }}
      />
    ));
    const pairs = [
      ["stepper", "r"],
      ["stepper-list", "l"],
      ["stepper-step", "s"],
      ["stepper-link", "k"],
      ["stepper-marker", "m"],
      ["stepper-text", "t"],
      ["stepper-label", "b"],
      ["stepper-description", "d"],
      ["stepper-optional", "o"],
      ["stepper-connector", "c"],
      ["stepper-hint", "h"],
    ] as const;
    for (const [name, cls] of pairs) expect(slot(name).classList.contains(cls)).toBe(true);
    expect(slot("stepper").classList.contains("mine")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { Stepper } from "<arc>";
      export function Page() {
        return (
          <Stepper
            aria-label="Checkout"
            items={[{ id: "a", label: "Cart" }, { id: "b", label: "Pay" }]}
            defaultSelectedKey="b"
            defaultLastCompletedStep="a"
          />
        );
      }
    `);
    expect(result.container.querySelector('[aria-current="step"]')?.textContent).toContain("Pay");
    result.unmount();
  });
});
