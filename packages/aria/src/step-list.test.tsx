import { describe, expect, test } from "bun:test";
import { createRoot, createSignal, flush, type ParentProps } from "@barqjs/core";
import { ref as makeRef } from "@barqjs/primitives/refs";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  user,
  within,
} from "@barqjs/testing";
import type { Key } from "./collections.ts";
import { provideLocale } from "./i18n.ts";
import { StepList, StepListItem, stepListState } from "./step-list.tsx";

interface Step {
  id: string;
  name: string;
}

const steps: Step[] = [
  { id: "step-one", name: "Step 1" },
  { id: "step-two", name: "Step 2" },
  { id: "step-three", name: "Step 3" },
  { id: "step-four", name: "Step 4" },
];

type Props = Omit<Parameters<typeof StepList<Step>>[0], "children" | "items">;

function Steps(props: Props) {
  return (
    <StepList<Step> id="steplist-id" aria-label="steplist-test" {...props} items={steps}>
      {(step) => <StepListItem>{step.name}</StepListItem>}
    </StepList>
  );
}

function links(): HTMLElement[] {
  return within(screen.getByLabelText("steplist-test")).getAllByRole("link");
}

function stateText(link: HTMLElement): string {
  return link.firstElementChild?.textContent ?? "";
}

describe("StepList", () => {
  test("renders: the first step is current and the rest cannot be reached yet", () => {
    const selected: Key[] = [];
    render(() => <Steps onSelectionChange={(key) => selected.push(key)} />);
    flush();
    const all = links();
    expect(all).toHaveLength(4);

    const [first] = all as [HTMLElement];
    expect(first.getAttribute("aria-current")).toBe("step");
    expect(first.getAttribute("tabindex")).toBe("0");
    expect(stateText(first)).not.toContain("Completed");
    expect(selected).toEqual(["step-one"]);

    for (const link of all.slice(1)) {
      expect(link.getAttribute("aria-disabled")).toBe("true");
      expect(stateText(link)).toContain("Not");
      expect(link.hasAttribute("tabindex")).toBe(false);
    }

    const list = screen.getByLabelText("steplist-test");
    expect(list.tagName).toBe("OL");
    expect(list.getAttribute("id")).toBe("steplist-id");
    expect(list.hasAttribute("tabindex")).toBe(false);
  });

  test("a step is named by its number, its state and its label", () => {
    render(() => <Steps defaultLastCompletedStep="step-two" defaultSelectedKey="step-three" />);
    flush();
    const all = links();

    for (const link of all) {
      const ids = (link.getAttribute("aria-labelledby") ?? "").split(" ");
      expect(ids).toHaveLength(3);
      for (const each of ids) expect(document.getElementById(each)).not.toBeNull();
    }

    function stateOf(link: HTMLElement): string {
      return (
        document.getElementById((link.getAttribute("aria-labelledby") ?? "").split(" ")[1] ?? "")
          ?.textContent ?? ""
      );
    }
    expect(stateOf(all[2] as HTMLElement)).toContain("Current");
    expect(stateOf(all[0] as HTMLElement)).toContain("Completed");
    expect(stateOf(all[3] as HTMLElement)).toContain("Not");

    expect(accessibleName(all[0] as HTMLElement)).toBe("1 Completed: Step 1");
    expect(accessibleName(all[2] as HTMLElement)).toBe("3 Current: Step 3");
    expect(accessibleName(all[3] as HTMLElement)).toBe("4 Not completed: Step 4");
  });

  test("a ref reaches the list", () => {
    const listRef = makeRef<HTMLOListElement>();
    render(() => <Steps ref={listRef.set} />);
    expect(listRef()).toBe(screen.getByLabelText<HTMLOListElement>("steplist-test"));
  });

  test("only completed steps and the one after them can be chosen", () => {
    const selected: Key[] = [];
    render(() => (
      <Steps
        defaultLastCompletedStep="step-two"
        defaultSelectedKey="step-three"
        onSelectionChange={(key) => selected.push(key)}
      />
    ));
    flush();
    const [one, , three, four] = links() as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];

    expect(one.hasAttribute("aria-current")).toBe(false);
    expect(stateText(one)).toContain("Completed");
    user.click(one);
    flush();
    expect(one.getAttribute("aria-current")).toBe("step");
    expect(selected).toEqual(["step-one"]);

    expect(stateText(one)).toContain("Current");
    user.click(three);
    flush();
    expect(three.getAttribute("aria-current")).toBe("step");
    expect(selected).toEqual(["step-one", "step-three"]);

    user.click(four);
    flush();
    expect(four.hasAttribute("aria-current")).toBe(false);
    expect(selected).toEqual(["step-one", "step-three"]);
  });

  test("Tab walks the reachable steps, Enter chooses, the arrows do not", () => {
    const selected: Key[] = [];
    render(() => (
      <Steps
        defaultLastCompletedStep="step-two"
        defaultSelectedKey="step-three"
        onSelectionChange={(key) => selected.push(key)}
      />
    ));
    flush();
    const all = links();
    expect(all[2]?.getAttribute("aria-current")).toBe("step");

    user.tab();
    expect(document.activeElement).toBe(all[0] as HTMLElement);
    user.tab();
    expect(document.activeElement).toBe(all[1] as HTMLElement);
    user.tab();
    expect(document.activeElement).toBe(all[2] as HTMLElement);

    user.tab({ shift: true });
    expect(document.activeElement).toBe(all[1] as HTMLElement);
    user.keyboard("{Enter}");
    flush();
    expect(selected).toEqual(["step-two"]);
    expect(all[1]?.getAttribute("aria-current")).toBe("step");

    user.keyDown("ArrowUp");
    flush();
    expect(all[1]?.getAttribute("aria-current")).toBe("step");
    expect(selected).toEqual(["step-two"]);
  });

  test("the arrows move focus, passing over steps that cannot be reached", () => {
    render(() => <Steps defaultLastCompletedStep="step-one" defaultSelectedKey="step-two" />);
    flush();
    const all = links();

    user.focus(all[0] as HTMLElement);
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(all[1] as HTMLElement);
    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(all[1] as HTMLElement);
    user.keyDown("ArrowUp");
    flush();
    expect(document.activeElement).toBe(all[0] as HTMLElement);
  });

  test("a disabled step cannot be chosen", () => {
    const selected: Key[] = [];
    render(() => (
      <Steps
        defaultLastCompletedStep="step-two"
        defaultSelectedKey="step-three"
        disabledKeys={["step-one"]}
        onSelectionChange={(key) => selected.push(key)}
      />
    ));
    flush();
    const [one] = links() as [HTMLElement];
    expect(one.getAttribute("aria-disabled")).toBe("true");
    expect(one.hasAttribute("data-disabled")).toBe(true);
    user.click(one);
    flush();
    expect(one.hasAttribute("aria-current")).toBe(false);
    expect(selected).toEqual([]);
  });

  test("a disabled list reaches nothing, and still selects the first open step", () => {
    const selected: Key[] = [];
    render(() => (
      <Steps
        defaultLastCompletedStep="step-two"
        isDisabled
        onSelectionChange={(key) => selected.push(key)}
      />
    ));
    flush();
    expect(selected).toEqual(["step-three"]);

    const all = links();
    for (const link of all) {
      expect(link.getAttribute("aria-disabled")).toBe("true");
      expect(link.hasAttribute("data-disabled")).toBe(true);
    }
    expect(all[2]?.getAttribute("aria-current")).toBe("step");

    user.click(all[1] as HTMLElement);
    flush();
    expect(all[1]?.hasAttribute("aria-current")).toBe(false);
    expect(selected).toEqual(["step-three"]);
  });

  test("a read-only list shows the progress and reaches nothing", () => {
    const selected: Key[] = [];
    render(() => (
      <Steps
        defaultSelectedKey="step-four"
        defaultLastCompletedStep="step-three"
        isReadOnly
        onSelectionChange={(key) => selected.push(key)}
      />
    ));
    flush();
    const all = links();
    for (const link of all) expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(all[3]?.getAttribute("aria-current")).toBe("step");
    expect(all[0]?.hasAttribute("data-disabled")).toBe(false);

    user.click(all[0] as HTMLElement);
    flush();
    expect(all[0]?.hasAttribute("aria-current")).toBe(false);
    expect(selected).toEqual([]);
  });

  test("selecting past the next step from outside completes what comes before", () => {
    const completed: (Key | null)[] = [];
    const [selectedKey, setSelectedKey] = createSignal("step-one");
    render(() => (
      <Steps
        defaultLastCompletedStep="step-one"
        selectedKey={selectedKey()}
        onLastCompletedStepChange={(key) => completed.push(key)}
      />
    ));
    flush();
    const all = links();
    expect(all[0]?.getAttribute("aria-current")).toBe("step");
    expect(all[0]?.textContent).toContain("Current");
    expect(completed).toEqual([]);

    setSelectedKey("step-two");
    flush();
    expect(completed).toEqual([]);
    expect(all[0]?.textContent).toContain("Completed");

    setSelectedKey("step-three");
    flush();
    expect(completed).toEqual(["step-two"]);
    expect(all[1]?.textContent).toContain("Completed");
  });

  test("a controlled last completed step does not move the selection", () => {
    const completed: (Key | null)[] = [];
    const selected: Key[] = [];
    const [last, setLast] = createSignal("step-one");
    render(() => (
      <Steps
        lastCompletedStep={last()}
        onSelectionChange={(key) => selected.push(key)}
        onLastCompletedStepChange={(key) => completed.push(key)}
      />
    ));
    flush();
    expect(completed).toEqual([]);
    expect(selected).toEqual(["step-two"]);
    const all = links();

    setLast("step-two");
    flush();
    setLast("step-three");
    flush();
    expect(completed).toEqual([]);
    expect(selected).toEqual(["step-two"]);
    expect(all[1]?.getAttribute("aria-current")).toBe("step");
    expect(all[2]?.textContent).toContain("Completed");
  });

  test("choosing the next step leaves the steps after it out of reach", () => {
    const completed: (Key | null)[] = [];
    render(() => (
      <Steps
        defaultLastCompletedStep="step-one"
        defaultSelectedKey="step-one"
        onLastCompletedStepChange={(key) => completed.push(key)}
      />
    ));
    flush();
    user.click(links()[1] as HTMLElement);
    flush();
    expect(links()[1]?.getAttribute("aria-current")).toBe("step");
    expect(completed).toEqual([]);
    expect(links()[2]?.getAttribute("aria-disabled")).toBe("true");
  });

  test("the list's name and the step states are localised", () => {
    function German(props: ParentProps) {
      const localeProps = provideLocale(() => "de-DE");
      return <div {...localeProps}>{props.children}</div>;
    }
    render(() => (
      <German>
        <StepList items={steps} defaultLastCompletedStep="step-one" defaultSelectedKey="step-two">
          {(step) => <StepListItem>{step.name}</StepListItem>}
        </StepList>
      </German>
    ));
    flush();
    const list = screen.getByRole("list");
    expect(accessibleName(list)).toBe("Schrittliste");
    const all = within(list).getAllByRole("link");
    expect(stateText(all[0] as HTMLElement)).toBe("Abgeschlossen: ");
    expect(stateText(all[1] as HTMLElement)).toBe("Aktuell: ");
    expect(stateText(all[2] as HTMLElement)).toBe("Nicht abgeschlossen: ");
  });

  test("data attributes carry the state", () => {
    render(() => <Steps defaultLastCompletedStep="step-one" defaultSelectedKey="step-two" />);
    flush();
    const [one, two, three] = links() as [HTMLElement, HTMLElement, HTMLElement];
    expect(one.hasAttribute("data-completed")).toBe(true);
    expect(one.hasAttribute("data-selectable")).toBe(true);
    expect(two.hasAttribute("data-selected")).toBe(true);
    expect(two.hasAttribute("data-selectable")).toBe(false);
    expect(three.hasAttribute("data-selectable")).toBe(false);
    expect(three.parentElement?.tagName).toBe("LI");
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => (
      <Steps defaultLastCompletedStep="step-one" defaultSelectedKey="step-two" />
    ));
    flush();
    expectNoAriaViolations(container);
  });
});

describe("stepListState", () => {
  test("what is completed and what is selectable follow the last completed step", () => {
    createRoot((dispose) => {
      const state = stepListState({ items: steps, defaultLastCompletedStep: "step-two" });
      expect(state.isCompleted("step-one")).toBe(true);
      expect(state.isCompleted("step-two")).toBe(true);
      expect(state.isCompleted("step-three")).toBe(false);
      expect(state.isCompleted(null)).toBe(false);
      expect(state.isSelectable("step-one")).toBe(true);
      expect(state.isSelectable("step-three")).toBe(true);
      expect(state.isSelectable("step-four")).toBe(false);
      dispose();
    });
  });

  test("selecting the step after the open one completes the step before it", () => {
    const completed: (Key | null)[] = [];
    const { state, dispose } = createRoot((release) => ({
      dispose: release,
      state: stepListState({
        items: steps,
        defaultLastCompletedStep: "step-one",
        onLastCompletedStepChange: (key) => completed.push(key),
      }),
    }));
    state.setSelectedKey("step-three");
    flush();
    expect(completed).toEqual(["step-two"]);
    expect(state.selectedKey()).toBe("step-three");
    dispose();
  });
});
