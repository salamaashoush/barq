import { describe, expect, test } from "bun:test";
import type { Incoming } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { DirectionProvider } from "./direction.tsx";
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
  type QuestionnaireShortcutMode,
} from "./questionnaire.tsx";

function Plans(
  props: Incoming<{
    shortcuts?: QuestionnaireShortcutMode;
    onAnswers?: (answers: [string, string][]) => void;
  }>,
) {
  return (
    <Questionnaire
      aria-label="Plan"
      shortcuts={props.shortcuts?.()}
      onSubmit={(event: SubmitEvent) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget as HTMLFormElement);
        props.onAnswers?.()?.([...data.entries()]);
      }}
    >
      <QuestionnaireProgress />
      <QuestionnaireItem name="plan" required>
        <QuestionnaireTitle>Choose a plan</QuestionnaireTitle>
        <QuestionnaireDescription>Enterprise is not available yet.</QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="plus">
            <span>Plus</span>
            <QuestionnaireChoiceDescription>For small teams</QuestionnaireChoiceDescription>
          </QuestionnaireChoice>
          <QuestionnaireChoice value="pro">
            <span>Pro</span>
          </QuestionnaireChoice>
          <QuestionnaireChoice value="enterprise" disabled>
            <span>Enterprise</span>
          </QuestionnaireChoice>
          <QuestionnaireInput aria-label="Another plan" placeholder="Something else" />
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireItem name="seats" multiple>
        <QuestionnaireTitle>Who needs a seat?</QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="design">
            <span>Design</span>
          </QuestionnaireChoice>
          <QuestionnaireChoice value="engineering">
            <span>Engineering</span>
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireActions>
        <QuestionnairePrevious />
        <QuestionnaireSkip />
        <QuestionnaireNext />
        <QuestionnaireSubmit />
      </QuestionnaireActions>
    </Questionnaire>
  );
}

const at = (slot: string): HTMLElement =>
  document.querySelector(`[data-slot="${slot}"]`) as HTMLElement;
const all = (slot: string): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`),
];
const choice = (value: string): HTMLInputElement =>
  document.querySelector(`input[value="${value}"]`) as HTMLInputElement;
const rules = (element: Element | null | undefined): string =>
  rulesFor([...(element?.classList ?? [])].join(" "));

describe("Questionnaire", () => {
  test("every part carries upstream's slot", () => {
    render(() => <Plans shortcuts="letters" />);
    for (const slot of [
      "questionnaire",
      "questionnaire-progress",
      "questionnaire-item",
      "questionnaire-title",
      "questionnaire-description",
      "questionnaire-choices",
      "questionnaire-choice",
      "questionnaire-choice-input",
      "questionnaire-choice-indicator",
      "questionnaire-choice-indicator-dot",
      "questionnaire-choice-indicator-check",
      "questionnaire-choice-label",
      "questionnaire-choice-shortcut",
      "questionnaire-choice-description",
      "questionnaire-input-wrapper",
      "questionnaire-input",
      "questionnaire-error",
      "questionnaire-actions",
      "questionnaire-previous",
      "questionnaire-skip",
      "questionnaire-next",
      "questionnaire-submit",
    ]) {
      expect(at(slot), slot).not.toBeNull();
    }
  });

  test("the parts are the elements a form is made of", () => {
    render(() => <Plans />);
    expect(at("questionnaire").tagName).toBe("FORM");
    expect(at("questionnaire-item").tagName).toBe("FIELDSET");
    expect(at("questionnaire-title").tagName).toBe("LEGEND");
    expect(at("questionnaire-choice").tagName).toBe("LABEL");
    expect(at("questionnaire-choice-input").tagName).toBe("INPUT");
    expect(at("questionnaire-next").tagName).toBe("BUTTON");
  });

  test("a choice is one label around its input, mark, text and shortcut", () => {
    render(() => <Plans />);
    const row = at("questionnaire-choice");
    expect([...row.children].map((child) => child.getAttribute("data-slot"))).toEqual([
      "questionnaire-choice-input",
      "questionnaire-choice-indicator",
      "questionnaire-choice-label",
      "questionnaire-choice-shortcut",
    ]);
    // The mark is drawn; the input beside it is what is read out.
    expect(at("questionnaire-choice-indicator").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("radio", { name: "Plus For small teams" })).toBe(choice("plus"));
  });

  test("the choice is the group its children style themselves from", () => {
    render(() => <Plans />);
    // Upstream's rules read `.group/questionnaire-choice[data-checked] …`, so
    // the marker class has to be the literal one.
    expect(at("questionnaire-choice").classList.contains("group/questionnaire-choice")).toBe(true);
    const mark = rules(at("questionnaire-choice-indicator"));
    expect(mark).toContain("group\\/questionnaire-choice");
    expect(mark).toContain('[data-type="radio"]');
  });

  test("the type, the checked state and the shortcut are attributes on the choice", () => {
    render(() => <Plans shortcuts="numbers" />);
    const row = at("questionnaire-choice");
    expect(row.getAttribute("data-type")).toBe("radio");
    expect(row.hasAttribute("data-unchecked")).toBe(true);
    expect(row.getAttribute("data-shortcut")).toBe("1");
    expect(at("questionnaire-choice-shortcut").textContent).toBe("1");

    user.click(choice("plus"));
    expect(row.hasAttribute("data-checked")).toBe(true);
    expect(all("questionnaire-choice")[2]?.hasAttribute("data-disabled")).toBe(true);
    expect(all("questionnaire-item")[1]?.querySelector("label")?.getAttribute("data-type")).toBe(
      "checkbox",
    );
  });

  test("a checked choice is filled, and a disabled one is dimmed and inert", () => {
    render(() => <Plans />);
    const row = rules(at("questionnaire-choice"));
    expect(row).toContain("[data-checked]");
    expect(row).toContain("background-color: var(--muted)");
    expect(row).toContain("[data-disabled]");
    expect(row).toContain("pointer-events: none");
    // Focus is on the input the label wraps, so the ring is drawn from there.
    expect(row).toContain(":has( > input:focus-visible)");
  });

  test("the input covers the whole row and is invisible, not hidden", () => {
    render(() => <Plans />);
    const input = rules(at("questionnaire-choice-input"));
    expect(input).toContain("position: absolute");
    for (const edge of ["top", "right", "bottom", "left"]) {
      expect(input).toContain(`${edge}: 0px`);
    }
    expect(input).toContain("opacity: 0%");
    expect(input).not.toContain("display: none");
  });

  test("a hidden question or button stays hidden despite the layout it is given", () => {
    render(() => <Plans />);
    // Both set a `display` of their own, which outranks the browser's rule for
    // `hidden` unless the component says so again.
    expect(all("questionnaire-item")[1]?.hidden).toBe(true);
    expect(rules(at("questionnaire-item"))).toMatch(/\[hidden\]\{display: none\}/);
    expect(at("questionnaire-submit").hidden).toBe(true);
    expect(rules(at("questionnaire-submit"))).toMatch(/\[hidden\]\{display: none\}/);
  });

  test("the layout uses logical properties, so it mirrors under rtl", () => {
    render(() => <Plans shortcuts="letters" />);
    const shortcut = rules(at("questionnaire-choice-shortcut"));
    expect(shortcut).toContain("margin-inline-start: auto");
    const row = rules(at("questionnaire-choice"));
    expect(row).toContain("text-align: start");
    expect(row).toContain("padding-inline");
    for (const slot of ["questionnaire-choice", "questionnaire-choice-shortcut"]) {
      const text = rules(at(slot));
      expect(text).not.toMatch(/(?:margin|padding)-(?:left|right)/);
      expect(text).not.toMatch(/text-align: (?:left|right)/);
    }
  });

  test("the navigation buttons are buttons of the package, sized and coloured as props say", () => {
    render(() => (
      <Questionnaire aria-label="Sizes">
        <QuestionnaireItem name="one">
          <QuestionnaireTitle>One</QuestionnaireTitle>
        </QuestionnaireItem>
        <QuestionnaireItem name="two">
          <QuestionnaireTitle>Two</QuestionnaireTitle>
        </QuestionnaireItem>
        <QuestionnaireActions>
          <QuestionnairePrevious />
          <QuestionnaireSkip size="sm" variant="ghost">
            Not now
          </QuestionnaireSkip>
          <QuestionnaireNext>Continue</QuestionnaireNext>
          <QuestionnaireSubmit />
        </QuestionnaireActions>
      </Questionnaire>
    ));
    expect(at("questionnaire-previous").getAttribute("data-variant")).toBe("outline");
    expect(at("questionnaire-previous").getAttribute("data-size")).toBe("default");
    expect(at("questionnaire-next").getAttribute("data-variant")).toBe("default");
    expect(at("questionnaire-submit").getAttribute("data-variant")).toBe("default");
    expect(at("questionnaire-skip").getAttribute("data-variant")).toBe("ghost");
    expect(at("questionnaire-skip").getAttribute("data-size")).toBe("sm");
    expect(at("questionnaire-skip").hasAttribute("size")).toBe(false);
    expect(at("questionnaire-skip").hasAttribute("variant")).toBe(false);

    expect(at("questionnaire-previous").textContent).toBe("Previous");
    expect(at("questionnaire-skip").textContent).toBe("Not now");
    expect(at("questionnaire-next").textContent).toBe("Continue");
    expect(at("questionnaire-submit").textContent).toBe("Submit");
  });

  test("the actions keep three columns whichever buttons are showing", () => {
    render(() => <Plans />);
    expect(rules(at("questionnaire-actions"))).toContain(
      "grid-template-columns: minmax(0,1fr) auto auto",
    );
    expect(rules(at("questionnaire-previous"))).toContain("grid-column-start: 1");
    expect(rules(at("questionnaire-skip"))).toContain("grid-column-start: 2");
    expect(rules(at("questionnaire-next"))).toContain("grid-column-start: 3");
    expect(rules(at("questionnaire-submit"))).toContain("grid-column-start: 3");
  });

  test("a caller's class is kept beside the part's own", () => {
    render(() => (
      <Questionnaire aria-label="Classes" class="survey">
        <QuestionnaireItem name="one" class="question">
          <QuestionnaireTitle class="heading">One</QuestionnaireTitle>
          <QuestionnaireChoices class="options">
            <QuestionnaireChoice value="a" class="option">
              A
            </QuestionnaireChoice>
            <QuestionnaireInput aria-label="Other" class="other" />
          </QuestionnaireChoices>
        </QuestionnaireItem>
      </Questionnaire>
    ));
    expect(at("questionnaire").classList.contains("survey")).toBe(true);
    expect(at("questionnaire-item").classList.contains("question")).toBe(true);
    expect(at("questionnaire-title").classList.contains("heading")).toBe(true);
    expect(at("questionnaire-choices").classList.contains("options")).toBe(true);
    expect(at("questionnaire-choice").classList.contains("option")).toBe(true);
    expect(at("questionnaire-input").classList.contains("other")).toBe(true);
    expect(at("questionnaire-input").classList.length).toBeGreaterThan(1);
  });

  test("answering through the styled parts submits the form's own data", () => {
    const answers: [string, string][][] = [];
    render(() => <Plans onAnswers={(seen) => answers.push(seen)} />);
    expect(at("questionnaire-progress").textContent).toBe("Question 1 of 2");

    user.click(at("questionnaire-next"));
    expect(at("questionnaire-error").hidden).toBe(false);
    expect(at("questionnaire-error").getAttribute("role")).toBe("alert");

    user.click(choice("pro"));
    user.click(at("questionnaire-next"));
    expect(at("questionnaire-progress").textContent).toBe("Question 2 of 2");
    user.click(choice("design"));
    user.click(choice("engineering"));
    user.click(at("questionnaire-submit"));
    expect(answers).toEqual([
      [
        ["plan", "pro"],
        ["seats", "design"],
        ["seats", "engineering"],
      ],
    ]);
  });

  test("under a right-to-left provider the arrow that goes back is the right one", () => {
    render(() => (
      <DirectionProvider dir="rtl">
        <Plans />
      </DirectionProvider>
    ));
    user.click(choice("plus"));
    user.click(at("questionnaire-next"));
    expect(at("questionnaire-progress").textContent).toBe("Question 2 of 2");
    user.keyDown("ArrowRight", { target: all("questionnaire-item")[1] as HTMLElement });
    expect(at("questionnaire-progress").textContent).toBe("Question 1 of 2");
  });

  test("a part drawn by the caller keeps upstream's slot and class, and reads the state", () => {
    render(() => (
      <Questionnaire aria-label="Plan">
        <QuestionnaireProgress
          class="mine"
          render={(part, state) => (
            <div {...part.props} ref={part.ref}>
              {() => `${state.current()} / ${state.total()}`}
            </div>
          )}
        />
        <QuestionnaireItem name="plan" required>
          <QuestionnaireTitle>Choose a plan</QuestionnaireTitle>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="plus">Plus</QuestionnaireChoice>
          </QuestionnaireChoices>
        </QuestionnaireItem>
        <QuestionnaireItem name="seats">
          <QuestionnaireTitle>Who needs a seat?</QuestionnaireTitle>
        </QuestionnaireItem>
        <QuestionnaireActions>
          <QuestionnaireNext
            render={(part, state) => (
              <button {...part.props} ref={part.ref}>
                {() => (state.status() === "answered" ? "Continue" : "Answer first")}
              </button>
            )}
          />
        </QuestionnaireActions>
      </Questionnaire>
    ));

    const bar = at("questionnaire-progress");
    expect(bar.getAttribute("role")).toBe("progressbar");
    expect(bar.classList.contains("mine")).toBe(true);
    expect(rules(bar)).toContain("tabular-nums");
    expect(bar.textContent).toBe("1 / 2");

    const next = at("questionnaire-next");
    expect(next.getAttribute("data-variant")).toBe("default");
    expect(next.textContent).toBe("Answer first");
    user.click(choice("plus"));
    expect(next.textContent).toBe("Continue");
    user.click(next);
    expect(bar.textContent).toBe("2 / 2");
  });
});
