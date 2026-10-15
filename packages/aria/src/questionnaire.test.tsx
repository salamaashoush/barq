import { describe, expect, test } from "bun:test";
import { Show, createSignal, flush, type Incoming } from "@barqjs/core";
import { expectNoAriaViolations, render, screen, tick, user } from "@barqjs/testing";
import { provideDirection } from "./i18n.ts";
import {
  Questionnaire,
  QuestionnaireChoice,
  QuestionnaireChoiceInput,
  QuestionnaireChoiceLabel,
  QuestionnaireChoices,
  QuestionnaireChoiceShortcut,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  type QuestionnaireItemDefinition,
  type QuestionnaireItemStatus,
  type QuestionnaireNavigationState,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  type QuestionnaireShortcutMode,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "./questionnaire.tsx";
import type { RenderPart } from "./utils.ts";

function Option(props: Incoming<{ value: string; label: string; disabled?: boolean }>) {
  return (
    <QuestionnaireChoice value={props.value()} disabled={props.disabled?.()}>
      <QuestionnaireChoiceInput />
      <QuestionnaireChoiceLabel>{props.label()}</QuestionnaireChoiceLabel>
      <QuestionnaireChoiceShortcut />
    </QuestionnaireChoice>
  );
}

interface SurveyProps {
  shortcuts?: QuestionnaireShortcutMode;
  items?: readonly QuestionnaireItemDefinition[];
  item?: string;
  defaultItem?: string;
  noValidate?: boolean;
  detailInvalid?: boolean;
  onItemChange?: (item: string) => void;
  onAnswers?: (answers: [string, string][]) => void;
  onStatus?: (status: QuestionnaireItemStatus) => void;
}

/**
 * Three questions: a required single choice with a freeform answer, an
 * optional single choice, and a required multiple choice.
 */
function Survey(props: Incoming<SurveyProps>) {
  return (
    <Questionnaire
      aria-label="Project"
      shortcuts={props.shortcuts?.()}
      items={props.items?.()}
      item={props.item?.()}
      defaultItem={props.defaultItem?.()}
      noValidate={props.noValidate?.()}
      onItemChange={(name: string) => props.onItemChange?.()?.(name)}
      onSubmit={(event: SubmitEvent) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget as HTMLFormElement);
        props.onAnswers?.()?.([...data.entries()]);
      }}
    >
      <QuestionnaireProgress />
      <QuestionnaireItem name="direction" required>
        <QuestionnaireTitle>What should we build?</QuestionnaireTitle>
        <QuestionnaireDescription>Choose a direction or write your own.</QuestionnaireDescription>
        <QuestionnaireChoices>
          <Option value="delegation" label="Delegation" />
          <Option value="questions" label="Question prompts" />
          <Option value="archive" label="Archive" disabled />
          <QuestionnaireInput aria-label="Another answer" placeholder="Type another answer" />
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireItem
        name="detail"
        invalid={props.detailInvalid?.()}
        onStatusChange={(status: QuestionnaireItemStatus) => props.onStatus?.()?.(status)}
      >
        <QuestionnaireTitle>How much detail?</QuestionnaireTitle>
        <QuestionnaireChoices>
          <Option value="focused" label="Focused" />
          <Option value="complete" label="Complete flow" />
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireItem name="signals" required multiple>
        <QuestionnaireTitle>Which signals matter?</QuestionnaireTitle>
        <QuestionnaireChoices>
          <Option value="progress" label="Progress" />
          <Option value="decisions" label="Decisions" />
          <Option value="risks" label="Risks" />
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnairePrevious />
      <QuestionnaireSkip />
      <QuestionnaireNext />
      <QuestionnaireSubmit />
    </Questionnaire>
  );
}

const form = (): HTMLFormElement => document.querySelector("form") as HTMLFormElement;
const groups = (): HTMLFieldSetElement[] => [...document.querySelectorAll("fieldset")];
const active = (): HTMLFieldSetElement =>
  document.querySelector("fieldset[data-active]") as HTMLFieldSetElement;
const activeTitle = (): string | null => active().querySelector("legend")?.textContent ?? null;
const choice = (value: string): HTMLInputElement =>
  document.querySelector(`input[value="${value}"]`) as HTMLInputElement;
const freeform = (): HTMLInputElement => screen.getByLabelText("Another answer");
const button = (name: string): HTMLButtonElement =>
  [...document.querySelectorAll("button")].find(
    (each) => each.textContent === name,
  ) as HTMLButtonElement;
const progress = (): HTMLElement => screen.getByRole("progressbar");

describe("Questionnaire", () => {
  test("it is a form showing one question at a time, the first to begin with", () => {
    render(() => <Survey />);
    expect(form().noValidate).toBe(true);
    expect(groups()).toHaveLength(3);
    expect(activeTitle()).toBe("What should we build?");
    expect(groups()[0]?.hidden).toBe(false);
    expect(groups()[1]?.hidden).toBe(true);
    expect(groups()[1]?.hasAttribute("inert")).toBe(true);
    expect(groups()[2]?.hidden).toBe(true);
  });

  test("each question is a group named by its title and described by its description", () => {
    render(() => <Survey />);
    const group = screen.getByRole("group", { name: "What should we build?" });
    const description = screen.getByText("Choose a direction or write your own.");
    expect(group.getAttribute("aria-describedby")).toBe(description.id);
    expect(group.getAttribute("tabindex")).toBe("-1");
  });

  test("the progress is a progressbar that says where you are in words", () => {
    render(() => <Survey />);
    expect(progress().getAttribute("aria-valuemin")).toBe("1");
    expect(progress().getAttribute("aria-valuemax")).toBe("3");
    expect(progress().getAttribute("aria-valuenow")).toBe("1");
    expect(progress().getAttribute("aria-valuetext")).toBe("Question 1 of 3");
    expect(progress().getAttribute("aria-live")).toBe("polite");
    expect(progress().textContent).toBe("Question 1 of 3");
  });

  test("the visible question has no accessibility violations", () => {
    render(() => <Survey />);
    expectNoAriaViolations(form());
  });

  test("a single-answer question is radios, a multiple one is checkboxes", () => {
    render(() => <Survey />);
    expect(choice("delegation").type).toBe("radio");
    expect(choice("delegation").name).toBe("direction");
    expect(choice("progress").type).toBe("checkbox");
    expect(choice("progress").name).toBe("signals");
  });

  test("choosing an answer checks it and marks the question answered", () => {
    render(() => <Survey />);
    expect(active().getAttribute("data-status")).toBe("unanswered");
    user.click(choice("delegation"));
    expect(choice("delegation").checked).toBe(true);
    expect(choice("delegation").parentElement?.hasAttribute("data-checked")).toBe(true);
    expect(choice("questions").parentElement?.hasAttribute("data-unchecked")).toBe(true);
    expect(active().getAttribute("data-status")).toBe("answered");
  });

  test("next is offered until the last question, which offers submit instead", () => {
    render(() => <Survey />);
    expect(button("Next").hidden).toBe(false);
    expect(button("Submit").hidden).toBe(true);
    expect(button("Submit").getAttribute("aria-hidden")).toBe("true");
    expect(button("Submit").getAttribute("tabindex")).toBe("-1");
    expect(button("Previous").hidden).toBe(true);

    user.click(choice("delegation"));
    user.click(button("Next"));
    expect(activeTitle()).toBe("How much detail?");
    expect(button("Previous").hidden).toBe(false);

    user.click(button("Skip"));
    expect(activeTitle()).toBe("Which signals matter?");
    expect(button("Next").hidden).toBe(true);
    expect(button("Submit").hidden).toBe(false);
    expect(button("Submit").type).toBe("submit");
    expect(progress().textContent).toBe("Question 3 of 3");
  });

  test("moving to a question moves focus to it", () => {
    render(() => <Survey />);
    user.click(choice("delegation"));
    user.click(button("Next"));
    expect(document.activeElement).toBe(groups()[1] as HTMLElement);
    user.click(button("Previous"));
    expect(document.activeElement).toBe(groups()[0] as HTMLElement);
  });

  test("next on an unanswered required question stays, says why and focuses an answer", () => {
    render(() => <Survey />);
    const error = active().querySelector("p:last-of-type") as HTMLElement;
    expect(error.hidden).toBe(true);
    expect(error.hasAttribute("role")).toBe(false);

    user.click(button("Next"));
    expect(activeTitle()).toBe("What should we build?");
    expect(active().getAttribute("aria-invalid")).toBe("true");
    expect(error.hidden).toBe(false);
    expect(error.getAttribute("role")).toBe("alert");
    expect(error.textContent).toBe("Choose an answer to continue.");
    expect(active().getAttribute("aria-describedby")).toContain(error.id);
    expect(document.activeElement).toBe(choice("delegation"));
    expect(choice("delegation").getAttribute("aria-invalid")).toBe("true");
  });

  test("the error clears as soon as the question is answered", () => {
    render(() => <Survey />);
    user.click(button("Next"));
    user.click(choice("questions"));
    expect(active().hasAttribute("aria-invalid")).toBe(false);
    expect((active().querySelector("p:last-of-type") as HTMLElement).hidden).toBe(true);
  });

  test("skip is offered only where the question is optional", () => {
    render(() => <Survey />);
    expect(button("Skip").hidden).toBe(true);
    user.click(choice("delegation"));
    user.click(button("Next"));
    expect(button("Skip").hidden).toBe(false);
  });

  test("a skipped question is recorded as skipped and submits no answer", () => {
    const statuses: QuestionnaireItemStatus[] = [];
    const answers: [string, string][][] = [];
    render(() => (
      <Survey onStatus={(status) => statuses.push(status)} onAnswers={(all) => answers.push(all)} />
    ));
    user.click(choice("delegation"));
    user.click(button("Next"));
    user.click(choice("focused"));
    user.click(button("Skip"));
    expect(statuses).toEqual(["answered", "skipped"]);
    expect(choice("focused").checked).toBe(false);
    expect(groups()[1]?.getAttribute("data-status")).toBe("skipped");

    user.click(choice("risks"));
    user.click(button("Submit"));
    expect(answers).toEqual([
      [
        ["direction", "delegation"],
        ["signals", "risks"],
      ],
    ]);
  });

  test("submitting sends every answer, several for a multiple question", () => {
    const answers: [string, string][][] = [];
    render(() => <Survey onAnswers={(all) => answers.push(all)} />);
    user.click(choice("questions"));
    user.click(button("Next"));
    user.click(choice("complete"));
    user.click(button("Next"));
    user.click(choice("progress"));
    user.click(choice("risks"));
    user.click(button("Submit"));
    expect(answers).toEqual([
      [
        ["direction", "questions"],
        ["detail", "complete"],
        ["signals", "progress"],
        ["signals", "risks"],
      ],
    ]);
  });

  test("submitting with a question unanswered goes back to the first one and does not submit", () => {
    const answers: [string, string][][] = [];
    render(() => <Survey defaultItem="signals" onAnswers={(all) => answers.push(all)} />);
    expect(activeTitle()).toBe("Which signals matter?");
    user.click(choice("risks"));
    user.click(button("Submit"));
    expect(answers).toEqual([]);
    expect(activeTitle()).toBe("What should we build?");
    expect(active().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(choice("delegation"));
  });

  test("a typed answer counts, and is submitted in place of the choices", () => {
    const answers: [string, string][][] = [];
    render(() => <Survey defaultItem="direction" onAnswers={(all) => answers.push(all)} />);
    expect(freeform().hasAttribute("name")).toBe(false);
    expect(freeform().hasAttribute("data-empty")).toBe(true);

    user.click(choice("delegation"));
    user.type(freeform(), "Reviews");
    expect(freeform().name).toBe("direction");
    expect(freeform().hasAttribute("data-filled")).toBe(true);
    expect(choice("delegation").checked).toBe(false);
    expect(active().getAttribute("data-status")).toBe("answered");

    user.click(button("Next"));
    user.click(button("Skip"));
    user.click(choice("risks"));
    user.click(button("Submit"));
    expect(answers[0]?.[0]).toEqual(["direction", "Reviews"]);
  });

  test("focusing the freeform answer does not select it, and emptying it unanswers", () => {
    render(() => <Survey />);
    user.click(freeform());
    expect(active().getAttribute("data-status")).toBe("unanswered");
    user.type(freeform(), "a");
    expect(active().getAttribute("data-status")).toBe("answered");
    user.clear(freeform());
    expect(active().getAttribute("data-status")).toBe("unanswered");
    expect(freeform().hasAttribute("name")).toBe(false);
  });

  test("radios are not required where a typed answer can stand in for them", () => {
    render(() => <Survey />);
    expect(choice("delegation").required).toBe(false);
    expect(choice("focused").required).toBe(false);
    expect(choice("progress").required).toBe(false);
  });

  test("a disabled choice is disabled, says so and is passed over by the keys", () => {
    render(() => <Survey shortcuts="letters" />);
    expect(choice("archive").disabled).toBe(true);
    expect(choice("archive").parentElement?.hasAttribute("data-disabled")).toBe(true);
    // It takes no letter, so the freeform-less count stays A and B.
    expect(choice("archive").parentElement?.hasAttribute("data-shortcut")).toBe(false);
  });
});

describe("Questionnaire keyboard", () => {
  test("Enter on a chosen answer confirms it and moves on", () => {
    render(() => <Survey />);
    user.click(choice("delegation"));
    expect(choice("delegation").getAttribute("aria-keyshortcuts")).toBe("Enter");
    user.keyDown("Enter", { target: choice("delegation") });
    expect(activeTitle()).toBe("How much detail?");
  });

  test("Enter on an answer that is not chosen does nothing, and never submits the form", () => {
    const answers: [string, string][][] = [];
    render(() => <Survey onAnswers={(all) => answers.push(all)} />);
    const proceed = user.keyDown("Enter", { target: choice("delegation") });
    expect(proceed).toBe(false);
    expect(activeTitle()).toBe("What should we build?");
    expect(answers).toEqual([]);
  });

  test("Enter in a filled freeform answer confirms it", () => {
    render(() => <Survey />);
    user.type(freeform(), "Reviews");
    user.keyDown("Enter", { target: freeform() });
    expect(activeTitle()).toBe("How much detail?");
  });

  test("Control+Enter confirms from anywhere in the question, validating first", () => {
    render(() => <Survey />);
    user.keyDown("Enter", { target: active(), ctrlKey: true });
    expect(activeTitle()).toBe("What should we build?");
    expect(active().getAttribute("aria-invalid")).toBe("true");

    user.click(choice("delegation"));
    user.keyDown("Enter", { target: active(), metaKey: true });
    expect(activeTitle()).toBe("How much detail?");
  });

  test("Control+Enter on the last question submits", () => {
    const answers: [string, string][][] = [];
    render(() => <Survey onAnswers={(all) => answers.push(all)} />);
    user.click(choice("delegation"));
    user.click(button("Next"));
    user.click(button("Skip"));
    user.click(choice("decisions"));
    user.keyDown("Enter", { target: choice("decisions"), ctrlKey: true });
    expect(answers).toHaveLength(1);
  });

  test("the left arrow goes back, the right arrow forward once the question is answered", () => {
    render(() => <Survey />);
    user.click(choice("delegation"));
    user.click(button("Next"));
    expect(activeTitle()).toBe("How much detail?");

    // Unanswered: right is not an implicit skip.
    user.keyDown("ArrowRight", { target: active() });
    expect(activeTitle()).toBe("How much detail?");

    user.keyDown("ArrowLeft", { target: active() });
    expect(activeTitle()).toBe("What should we build?");

    user.keyDown("ArrowRight", { target: active() });
    expect(activeTitle()).toBe("How much detail?");
  });

  test("right to left, the two arrows swap", () => {
    function Mirrored() {
      provideDirection("rtl");
      return <Survey />;
    }
    render(() => <Mirrored />);
    user.click(choice("delegation"));
    user.keyDown("ArrowLeft", { target: active() });
    expect(activeTitle()).toBe("How much detail?");
    user.keyDown("ArrowRight", { target: active() });
    expect(activeTitle()).toBe("What should we build?");
    expect(active().getAttribute("aria-keyshortcuts")).toContain("ArrowLeft");
  });

  test("the horizontal arrows are left alone inside text and on radios", () => {
    render(() => <Survey />);
    user.click(choice("delegation"));
    user.type(freeform(), "x");
    const inText = user.keyDown("ArrowRight", { target: freeform() });
    expect(inText).toBe(true);
    const onRadio = user.keyDown("ArrowRight", { target: choice("delegation") });
    expect(onRadio).toBe(true);
    expect(activeTitle()).toBe("What should we build?");
  });

  test("the question advertises the keys that work on it right now", () => {
    render(() => <Survey />);
    expect(active().getAttribute("aria-keyshortcuts")).toBe(
      "Meta+Enter Control+Enter ArrowUp ArrowDown",
    );
    user.click(choice("delegation"));
    expect(active().getAttribute("aria-keyshortcuts")).toBe(
      "Meta+Enter Control+Enter ArrowUp ArrowDown ArrowRight",
    );
    user.click(button("Next"));
    expect(active().getAttribute("aria-keyshortcuts")).toBe(
      "Meta+Enter Control+Enter ArrowUp ArrowDown ArrowLeft",
    );
    expect(groups()[0]?.hasAttribute("aria-keyshortcuts")).toBe(false);
  });

  test("down from the question enters its answers, at the chosen one if there is one", () => {
    render(() => <Survey defaultItem="signals" />);
    user.focus(active());
    user.keyDown("ArrowDown");
    expect(document.activeElement).toBe(choice("progress"));

    user.click(choice("risks"));
    user.focus(active());
    user.keyDown("ArrowUp");
    expect(document.activeElement).toBe(choice("risks"));
  });

  test("up and down walk checkboxes without toggling them, and wrap", () => {
    render(() => <Survey defaultItem="signals" />);
    user.focus(choice("progress"));
    user.keyDown("ArrowDown");
    expect(document.activeElement).toBe(choice("decisions"));
    expect(choice("decisions").checked).toBe(false);
    user.keyDown("ArrowUp");
    user.keyDown("ArrowUp");
    expect(document.activeElement).toBe(choice("risks"));
  });

  test("down from the last radio reaches the freeform answer, and up from it when empty returns", () => {
    render(() => <Survey />);
    user.focus(choice("questions"));
    user.keyDown("ArrowDown");
    expect(document.activeElement).toBe(freeform());

    user.keyDown("ArrowUp");
    expect(document.activeElement).toBe(choice("questions"));
    // Arriving on a radio by arrow selects it, as arrowing between radios does.
    expect(choice("questions").checked).toBe(true);
  });

  test("a freeform answer holding text keeps its caret keys", () => {
    render(() => <Survey />);
    user.type(freeform(), "x");
    const proceed = user.keyDown("ArrowUp", { target: freeform() });
    expect(proceed).toBe(true);
    expect(document.activeElement).toBe(freeform());
  });

  test("letter shortcuts are assigned to the enabled choices in order and shown", () => {
    render(() => <Survey shortcuts="letters" />);
    expect(form().getAttribute("data-shortcuts")).toBe("letters");
    expect(choice("delegation").parentElement?.getAttribute("data-shortcut")).toBe("A");
    expect(choice("questions").parentElement?.getAttribute("data-shortcut")).toBe("B");
    expect(choice("delegation").getAttribute("aria-keyshortcuts")).toBe("A");
    const shown = choice("questions").parentElement?.querySelector(
      "span[aria-hidden]",
    ) as HTMLElement;
    expect(shown.textContent).toBe("B");
    expect(shown.hidden).toBe(false);
  });

  test("pressing a shortcut chooses and focuses that answer", () => {
    render(() => <Survey shortcuts="letters" />);
    user.keyDown("b", { target: active() });
    expect(choice("questions").checked).toBe(true);
    expect(document.activeElement).toBe(choice("questions"));
    expect(choice("questions").getAttribute("aria-keyshortcuts")).toBe("B Enter");
  });

  test("number shortcuts work the same way", () => {
    render(() => <Survey shortcuts="numbers" defaultItem="signals" />);
    user.keyDown("2", { target: active() });
    user.keyDown("3", { target: active() });
    expect(choice("decisions").checked).toBe(true);
    expect(choice("risks").checked).toBe(true);
  });

  test("a shortcut typed into the freeform answer is text, not a choice", () => {
    render(() => <Survey shortcuts="letters" />);
    user.type(freeform(), "a");
    expect(choice("delegation").checked).toBe(false);
    expect(freeform().value).toBe("a");
  });

  test("without shortcuts the marker is hidden and letters do nothing", () => {
    render(() => <Survey />);
    const marker = choice("delegation").parentElement?.querySelector(
      "span[aria-hidden]",
    ) as HTMLElement;
    expect(marker.hidden).toBe(true);
    user.keyDown("a", { target: active() });
    expect(choice("delegation").checked).toBe(false);
  });

  test("a modified, repeated or composing key is not the questionnaire's", () => {
    render(() => <Survey shortcuts="letters" />);
    user.keyDown("a", { target: active(), altKey: true });
    expect(choice("delegation").checked).toBe(false);
    user.keyDown("a", { target: active(), repeat: true });
    expect(choice("delegation").checked).toBe(false);
    active().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "a",
        bubbles: true,
        cancelable: true,
        isComposing: true,
      }),
    );
    flush();
    expect(choice("delegation").checked).toBe(false);
  });
});

describe("Questionnaire state", () => {
  test("defaultItem chooses where to start", () => {
    render(() => <Survey defaultItem="detail" />);
    expect(activeTitle()).toBe("How much detail?");
    expect(progress().getAttribute("aria-valuenow")).toBe("2");
  });

  test("starting is not reported as navigation, moving is, by name", () => {
    const seen: string[] = [];
    render(() => <Survey onItemChange={(name) => seen.push(name)} />);
    flush();
    expect(seen).toEqual([]);
    user.click(choice("delegation"));
    user.click(button("Next"));
    expect(seen).toEqual(["detail"]);
  });

  test("a controlled item moves only when its owner moves it", () => {
    const seen: string[] = [];
    const [item, setItem] = createSignal("direction");
    render(() => <Survey item={item()} onItemChange={(name) => seen.push(name)} />);
    user.click(choice("delegation"));
    user.click(button("Next"));
    expect(seen).toEqual(["detail"]);
    expect(activeTitle()).toBe("What should we build?");

    setItem("detail");
    flush();
    expect(activeTitle()).toBe("How much detail?");
    expect(document.activeElement).toBe(groups()[1] as HTMLElement);
  });

  test("an externally invalid question blocks next and says so without an attempt", () => {
    render(() => <Survey defaultItem="detail" detailInvalid />);
    expect(active().getAttribute("aria-invalid")).toBe("true");
    const error = active().querySelector("p:last-of-type") as HTMLElement;
    expect(error.textContent).toBe("Choose an answer or skip this question.");
    user.click(choice("focused"));
    user.click(button("Next"));
    expect(activeTitle()).toBe("How much detail?");
  });

  test("an intentional skip is valid even while the question is externally invalid", () => {
    render(() => <Survey defaultItem="detail" detailInvalid />);
    user.click(button("Skip"));
    expect(activeTitle()).toBe("Which signals matter?");
    expect(groups()[1]?.hasAttribute("aria-invalid")).toBe(false);
  });

  test("skipping the last question submits", () => {
    const answers: [string, string][][] = [];
    function Short() {
      return (
        <Questionnaire
          aria-label="Short"
          onSubmit={(event: SubmitEvent) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget as HTMLFormElement);
            answers.push([...data.entries()]);
          }}
        >
          <QuestionnaireItem name="plan">
            <QuestionnaireTitle>Which plan?</QuestionnaireTitle>
            <QuestionnaireChoices>
              <Option value="plus" label="Plus" />
            </QuestionnaireChoices>
          </QuestionnaireItem>
          <QuestionnaireSkip />
          <QuestionnaireSubmit />
        </Questionnaire>
      );
    }
    render(() => <Short />);
    user.click(choice("plus"));
    user.click(button("Skip"));
    expect(answers).toEqual([[]]);
  });

  test("reset puts back the defaults, the first question and a clean slate", () => {
    function Defaults() {
      return (
        <Questionnaire aria-label="Defaults">
          <QuestionnaireItem name="plan" required>
            <QuestionnaireTitle>Which plan?</QuestionnaireTitle>
            <QuestionnaireChoices>
              <QuestionnaireChoice value="plus" defaultChecked>
                <QuestionnaireChoiceInput />
                <QuestionnaireChoiceLabel>Plus</QuestionnaireChoiceLabel>
              </QuestionnaireChoice>
              <Option value="pro" label="Pro" />
            </QuestionnaireChoices>
            <QuestionnaireError />
          </QuestionnaireItem>
          <QuestionnaireItem name="seats">
            <QuestionnaireTitle>How many seats?</QuestionnaireTitle>
            <QuestionnaireChoices>
              <QuestionnaireInput aria-label="Seats" type="number" defaultValue="5" />
            </QuestionnaireChoices>
          </QuestionnaireItem>
          <QuestionnaireNext />
          <QuestionnaireSkip />
        </Questionnaire>
      );
    }
    render(() => <Defaults />);
    const seats = screen.getByLabelText("Seats") as HTMLInputElement;
    expect(choice("plus").checked).toBe(true);
    expect(active().getAttribute("data-status")).toBe("answered");
    expect(seats.value).toBe("5");
    expect(seats.name).toBe("seats");

    user.click(choice("pro"));
    user.click(button("Next"));
    user.click(button("Skip"));
    expect(groups()[1]?.getAttribute("data-status")).toBe("skipped");

    form().reset();
    flush();
    expect(activeTitle()).toBe("Which plan?");
    expect(choice("plus").checked).toBe(true);
    expect(choice("pro").checked).toBe(false);
    expect(groups()[1]?.getAttribute("data-status")).toBe("answered");
    expect(seats.value).toBe("5");
  });

  test("a controlled choice follows its owner, not the click", () => {
    const [picked, setPicked] = createSignal("plus");
    const asked: string[] = [];
    function Controlled() {
      return (
        <Questionnaire aria-label="Controlled">
          <QuestionnaireItem name="plan" required>
            <QuestionnaireTitle>Which plan?</QuestionnaireTitle>
            <QuestionnaireChoices>
              <QuestionnaireChoice
                value="plus"
                checked={picked() === "plus"}
                onChange={() => asked.push("plus")}
              >
                <QuestionnaireChoiceInput />
                <QuestionnaireChoiceLabel>Plus</QuestionnaireChoiceLabel>
              </QuestionnaireChoice>
              <QuestionnaireChoice
                value="pro"
                checked={picked() === "pro"}
                onChange={() => asked.push("pro")}
              >
                <QuestionnaireChoiceInput />
                <QuestionnaireChoiceLabel>Pro</QuestionnaireChoiceLabel>
              </QuestionnaireChoice>
            </QuestionnaireChoices>
          </QuestionnaireItem>
        </Questionnaire>
      );
    }
    render(() => <Controlled />);
    flush();
    expect(choice("plus").checked).toBe(true);
    expect(active().getAttribute("data-status")).toBe("answered");

    user.click(choice("pro"));
    expect(asked).toEqual(["pro"]);
    expect(choice("pro").checked).toBe(false);
    expect(choice("plus").checked).toBe(true);

    setPicked("pro");
    flush();
    expect(choice("pro").checked).toBe(true);
    expect(choice("plus").checked).toBe(false);
  });

  test("a question that stops being multiple keeps one of its answers", () => {
    const [multiple, setMultiple] = createSignal(true);
    function Switching() {
      return (
        <Questionnaire aria-label="Switching">
          <QuestionnaireItem name="signals" multiple={multiple()}>
            <QuestionnaireTitle>Which signals?</QuestionnaireTitle>
            <QuestionnaireChoices>
              <Option value="progress" label="Progress" />
              <Option value="risks" label="Risks" />
            </QuestionnaireChoices>
          </QuestionnaireItem>
        </Questionnaire>
      );
    }
    render(() => <Switching />);
    user.click(choice("progress"));
    user.click(choice("risks"));
    setMultiple(false);
    flush();
    expect(choice("progress").type).toBe("radio");
    expect(choice("progress").checked).toBe(true);
    expect(choice("risks").checked).toBe(false);
  });

  test("a disabled question is not part of the sequence", () => {
    function Gated() {
      return (
        <Questionnaire aria-label="Gated">
          <QuestionnaireProgress />
          <QuestionnaireItem name="one">
            <QuestionnaireTitle>One</QuestionnaireTitle>
          </QuestionnaireItem>
          <QuestionnaireItem name="two" disabled>
            <QuestionnaireTitle>Two</QuestionnaireTitle>
          </QuestionnaireItem>
          <QuestionnaireItem name="three">
            <QuestionnaireTitle>Three</QuestionnaireTitle>
          </QuestionnaireItem>
          <QuestionnaireSkip />
        </Questionnaire>
      );
    }
    render(() => <Gated />);
    expect(progress().getAttribute("aria-valuemax")).toBe("2");
    expect(groups()[1]?.disabled).toBe(true);
    user.click(button("Skip"));
    expect(activeTitle()).toBe("Three");
  });

  test("a question added later takes its place in document order", async () => {
    const [shown, setShown] = createSignal(false);
    function Growing() {
      return (
        <Questionnaire aria-label="Growing">
          <QuestionnaireProgress />
          <QuestionnaireItem name="one">
            <QuestionnaireTitle>One</QuestionnaireTitle>
          </QuestionnaireItem>
          <Show when={shown()}>
            <QuestionnaireItem name="two">
              <QuestionnaireTitle>Two</QuestionnaireTitle>
            </QuestionnaireItem>
          </Show>
          <QuestionnaireItem name="three">
            <QuestionnaireTitle>Three</QuestionnaireTitle>
          </QuestionnaireItem>
          <QuestionnaireSkip />
        </Questionnaire>
      );
    }
    render(() => <Growing />);
    expect(progress().getAttribute("aria-valuemax")).toBe("2");
    setShown(true);
    flush();
    expect(progress().getAttribute("aria-valuemax")).toBe("3");
    // It registered last and belongs second. A mutation observer reports that
    // the tree changed, and it reports on a microtask.
    await tick();
    flush();
    user.click(button("Skip"));
    expect(activeTitle()).toBe("Two");
  });

  test("declared items give the count and the shortcuts before anything registers", () => {
    const items: QuestionnaireItemDefinition[] = [
      {
        name: "direction",
        required: true,
        choices: [
          { value: "delegation" },
          { value: "questions" },
          { value: "archive", disabled: true },
        ],
      },
      { name: "detail", choices: [{ value: "focused" }, { value: "complete" }] },
      { name: "retired", disabled: true },
      {
        name: "signals",
        required: true,
        choices: [{ value: "progress" }, { value: "decisions" }, { value: "risks" }],
      },
    ];
    render(() => <Survey items={items} shortcuts="numbers" />);
    expect(progress().getAttribute("aria-valuemax")).toBe("3");
    expect(choice("questions").parentElement?.getAttribute("data-shortcut")).toBe("2");
    expect(button("Skip").hidden).toBe(true);
  });

  test("native validation, when asked for, reports a malformed typed answer", () => {
    function Email() {
      return (
        <Questionnaire aria-label="Contact" noValidate={false}>
          <QuestionnaireItem name="email" required>
            <QuestionnaireTitle>Where do we write?</QuestionnaireTitle>
            <QuestionnaireChoices>
              <QuestionnaireInput aria-label="Email" type="email" />
            </QuestionnaireChoices>
          </QuestionnaireItem>
          <QuestionnaireItem name="next">
            <QuestionnaireTitle>Then</QuestionnaireTitle>
          </QuestionnaireItem>
          <QuestionnaireNext />
        </Questionnaire>
      );
    }
    render(() => <Email />);
    const email = screen.getByLabelText("Email") as HTMLInputElement;
    user.type(email, "salama");
    user.click(button("Next"));
    expect(activeTitle()).toBe("Where do we write?");
    user.type(email, "@example.com");
    user.click(button("Next"));
    expect(activeTitle()).toBe("Then");
  });

  test("a part outside its parent says what is wrong", () => {
    expect(() => render(() => <QuestionnaireProgress />)).toThrow("inside a <Questionnaire>");
    expect(() =>
      render(() => (
        <Questionnaire aria-label="Loose">
          <QuestionnaireTitle>Loose</QuestionnaireTitle>
        </Questionnaire>
      )),
    ).toThrow("inside a <QuestionnaireItem>");
  });
});

describe("Questionnaire render", () => {
  test("the progress draws the caller's element, with its props and where the questionnaire is", () => {
    let element = null as Element | null;
    render(() => (
      <Questionnaire aria-label="Steps">
        <QuestionnaireProgress
          class="mine"
          ref={(node: HTMLDivElement | null) => {
            element = node;
          }}
          render={(part, state) => (
            <section {...part.props} ref={part.ref}>
              {() => `${state.current()} / ${state.total()}`}
              {() => (state.first() ? " first" : "")}
              {() => (state.last() ? " last" : "")}
            </section>
          )}
        />
        <QuestionnaireItem name="plan" required>
          <QuestionnaireTitle>Which plan?</QuestionnaireTitle>
          <QuestionnaireChoices>
            <Option value="plus" label="Plus" />
          </QuestionnaireChoices>
        </QuestionnaireItem>
        <QuestionnaireItem name="seats">
          <QuestionnaireTitle>How many seats?</QuestionnaireTitle>
        </QuestionnaireItem>
        <QuestionnaireNext />
      </Questionnaire>
    ));

    const bar = progress();
    expect(bar.tagName).toBe("SECTION");
    expect(element).toBe(bar);
    expect(bar.classList.contains("mine")).toBe(true);
    expect(bar.getAttribute("aria-valuenow")).toBe("1");
    expect(bar.getAttribute("aria-valuetext")).toBe("Question 1 of 2");
    expect(bar.textContent).toBe("1 / 2 first");

    user.click(choice("plus"));
    user.click(button("Next"));
    expect(bar.textContent).toBe("2 / 2 last");
    expect(bar.getAttribute("aria-valuenow")).toBe("2");
    expect(bar.getAttribute("data-current")).toBe("2");
  });

  test("the parts of a question hand their state to the elements drawn in their place", () => {
    render(() => (
      <Questionnaire aria-label="Steps" shortcuts="letters">
        <QuestionnaireItem name="plan" required>
          <QuestionnaireTitle render={(part) => <h2 {...part.props} ref={part.ref} />} />
          <QuestionnaireDescription
            render={(part) => (
              <span {...part.props} ref={part.ref}>
                Pick one
              </span>
            )}
          />
          <QuestionnaireChoices
            render={(part, state) => (
              <div {...part.props} ref={part.ref} data-testid="choices">
                <span data-testid="mode">{() => state.shortcuts() ?? "none"}</span>
                <QuestionnaireChoice
                  value="plus"
                  render={(choicePart, choiceState) => (
                    <label {...choicePart.props} ref={choicePart.ref} data-testid="plus">
                      <QuestionnaireChoiceInput
                        render={(inputPart, inputState) => (
                          <input
                            {...inputPart.props}
                            ref={inputPart.ref}
                            data-seen={() => String(inputState.checked())}
                          />
                        )}
                      />
                      <QuestionnaireChoiceLabel
                        render={(labelPart) => (
                          <b {...labelPart.props} ref={labelPart.ref}>
                            Plus
                          </b>
                        )}
                      />
                      <QuestionnaireChoiceShortcut
                        render={(shortcutPart, shortcutState) => (
                          <kbd {...shortcutPart.props} ref={shortcutPart.ref}>
                            {() => `key ${shortcutState.shortcut() ?? "none"}`}
                          </kbd>
                        )}
                      />
                      <i data-testid="plus-state">
                        {() =>
                          [
                            choiceState.checked(),
                            choiceState.disabled(),
                            choiceState.invalid(),
                            choiceState.shortcut(),
                            choiceState.type(),
                          ].join(" ")
                        }
                      </i>
                    </label>
                  )}
                />
                <QuestionnaireInput
                  aria-label="Another plan"
                  render={(inputPart, inputState) => (
                    <input
                      {...inputPart.props}
                      ref={inputPart.ref}
                      data-state={() =>
                        [inputState.disabled(), inputState.filled(), inputState.invalid()].join(" ")
                      }
                    />
                  )}
                />
              </div>
            )}
          />
          <QuestionnaireError
            render={(part, state) => (
              <p {...part.props} ref={part.ref} data-testid="error">
                {() => (state.invalid() ? "Needed" : "Fine")}
              </p>
            )}
          />
        </QuestionnaireItem>
        <QuestionnaireItem name="seats">
          <QuestionnaireTitle>How many seats?</QuestionnaireTitle>
        </QuestionnaireItem>
        <QuestionnaireNext />
      </Questionnaire>
    ));

    const heading = screen.getByRole("heading", { name: "" });
    expect(heading.tagName).toBe("H2");
    expect(screen.getByText("Pick one").tagName).toBe("SPAN");
    expect(screen.getByTestId("mode").textContent).toBe("letters");
    expect(screen.getByTestId("choices").getAttribute("data-shortcuts")).toBe("letters");

    const plus = choice("plus");
    const plusState = screen.getByTestId("plus-state");
    const typed = screen.getByLabelText("Another plan") as HTMLInputElement;
    expect(plusState.textContent).toBe("false false false A radio");
    expect(plus.getAttribute("data-seen")).toBe("false");
    expect(screen.getByText("key A").tagName).toBe("KBD");
    expect(screen.getByText("Plus").tagName).toBe("B");
    expect(typed.getAttribute("data-state")).toBe("false false false");
    expect(screen.getByTestId("error").textContent).toBe("Fine");

    user.click(button("Next"));
    expect(plusState.textContent).toBe("false false true A radio");
    expect(typed.getAttribute("data-state")).toBe("false false true");
    expect(screen.getByTestId("error").textContent).toBe("Needed");
    expect(screen.getByTestId("error").hidden).toBe(false);

    user.click(plus);
    expect(plus.checked).toBe(true);
    expect(plus.getAttribute("data-seen")).toBe("true");
    expect(plusState.textContent).toBe("true false false A radio");
    expect(screen.getByTestId("plus").hasAttribute("data-checked")).toBe(true);

    user.type(typed, "Team");
    expect(typed.getAttribute("data-state")).toBe("false true false");
  });

  test("a navigation button hands its state to the element drawn in its place", () => {
    let submitted = 0;
    const nav =
      (label: string): RenderPart<QuestionnaireNavigationState> =>
      (part, state) => (
        <button {...part.props} ref={part.ref} data-testid={label}>
          {() =>
            `${label} ${state.status() ?? "none"} ${state.shortcut() ?? "none"} ${String(state.visible())} ${String(state.disabled())}`
          }
        </button>
      );
    render(() => (
      <Questionnaire
        aria-label="Steps"
        onSubmit={(event: SubmitEvent) => {
          event.preventDefault();
          submitted++;
        }}
      >
        <QuestionnaireItem name="plan" required>
          <QuestionnaireTitle>Which plan?</QuestionnaireTitle>
          <QuestionnaireChoices>
            <Option value="plus" label="Plus" />
          </QuestionnaireChoices>
        </QuestionnaireItem>
        <QuestionnaireItem name="seats">
          <QuestionnaireTitle>How many seats?</QuestionnaireTitle>
          <QuestionnaireChoices>
            <Option value="one" label="One" />
          </QuestionnaireChoices>
        </QuestionnaireItem>
        <QuestionnairePrevious render={nav("previous")} />
        <QuestionnaireSkip render={nav("skip")} />
        <QuestionnaireNext render={nav("next")} />
        <QuestionnaireSubmit disabled render={nav("submit")} />
      </Questionnaire>
    ));

    const text = (label: string): string | null => screen.getByTestId(label).textContent;
    expect(text("previous")).toBe("previous unanswered none false false");
    expect(text("skip")).toBe("skip unanswered none false false");
    expect(text("next")).toBe("next unanswered Enter true false");
    expect(text("submit")).toBe("submit unanswered none false true");
    expect(screen.getByTestId("next").hidden).toBe(false);
    expect(screen.getByTestId("previous").hidden).toBe(true);

    user.click(choice("plus"));
    expect(text("next")).toBe("next answered Enter true false");
    user.click(screen.getByTestId("next"));
    expect(activeTitle()).toBe("How many seats?");
    expect(text("previous")).toBe("previous unanswered none true false");
    expect(text("skip")).toBe("skip unanswered none true false");
    expect(text("next")).toBe("next unanswered none false false");
    expect(screen.getByTestId("submit").getAttribute("type")).toBe("submit");

    user.click(screen.getByTestId("previous"));
    expect(activeTitle()).toBe("Which plan?");
    expect(submitted).toBe(0);
  });
});
