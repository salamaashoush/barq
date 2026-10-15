import { afterEach, describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";
import { Toaster, toast } from "@barqjs/ui";

import { hydrateExamples } from "../test-harness.ts";
import QuestionnaireConditional from "./questionnaire-conditional.tsx";
import QuestionnaireControlled from "./questionnaire-controlled.tsx";
import QuestionnaireFreeform from "./questionnaire-freeform.tsx";
import QuestionnaireMultiple from "./questionnaire-multiple.tsx";
import QuestionnaireNavigationState from "./questionnaire-navigation-state.tsx";
import QuestionnaireProgressExample from "./questionnaire-progress.tsx";
import QuestionnaireSkipExample from "./questionnaire-skip.tsx";
import QuestionnaireValidation from "./questionnaire-validation.tsx";

const toastText = (): string | null | undefined =>
  document.querySelector('[data-slot="toast"]')?.textContent;

describe("the questionnaire examples", () => {
  afterEach(() => {
    toast.dismiss();
  });

  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("questionnaire")).toEqual([]);
  });

  test("a multiple item submits every choice that was ticked", async () => {
    render(() => <QuestionnaireMultiple />);
    await user.click(screen.getByRole("checkbox", { name: /Existing tests/ }));
    await user.click(screen.getByRole("checkbox", { name: /Recent commit history/ }));
    flush();
    await user.click(screen.getByRole("button", { name: "Share context" }));
    flush();
    expect(screen.getByRole("status").textContent).toBe("Context: tests, history");
  });

  test("a single item submits the one choice that was picked", async () => {
    render(() => <QuestionnaireFreeform />);
    await user.click(screen.getByRole("radio", { name: /Refactor one module at a time/ }));
    flush();
    await user.click(screen.getByRole("button", { name: "Use this approach" }));
    flush();
    expect(screen.getByRole("status").textContent).toBe("Approach: module");
  });

  test("the controlled checkpoint follows Next", async () => {
    render(() => <QuestionnaireControlled />);
    expect(screen.getByRole("status").textContent).toBe("Current checkpoint: Change scope");
    await user.click(screen.getByRole("radio", { name: /Only the target component/ }));
    flush();
    await user.click(screen.getByRole("button", { name: "Next" }));
    flush();
    expect(screen.getByRole("status").textContent).toBe("Current checkpoint: Verification");
  });

  test("a local run leaves the environment question out", async () => {
    render(() => (
      <>
        <Toaster />
        <QuestionnaireConditional />
      </>
    ));
    await user.click(screen.getByRole("radio", { name: /Local workspace/ }));
    flush();
    await user.click(screen.getByRole("button", { name: "Next" }));
    flush();
    expect(screen.getByText("When should the agent request approval?")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: /Before running commands/ }));
    flush();
    await user.click(screen.getByRole("button", { name: "Save execution plan" }));
    flush();
    expect(toastText()).toContain("Environment: Not applicable");
  });

  test("Next waits for an answer", async () => {
    render(() => <QuestionnaireNavigationState />);
    const next = screen.getByRole<HTMLButtonElement>("button", { name: "Next" });
    expect(next.disabled).toBe(true);
    await user.click(screen.getByRole("radio", { name: /Project files and tests/ }));
    flush();
    expect(next.disabled).toBe(false);
  });

  test("the custom progress fills one segment per checkpoint reached", async () => {
    render(() => <QuestionnaireProgressExample />);
    const bar = screen.getByRole("progressbar");
    const segments = (): Element[] => [...(bar.firstElementChild?.children ?? [])];
    // Reached segments share the first one's class, which is always reached.
    const reached = (): boolean[] =>
      segments().map((each) => each.className === segments()[0]?.className);
    expect(bar.textContent).toBe("Checkpoint 1 of 4");
    expect(bar.getAttribute("aria-valuetext")).toBe("Question 1 of 4");
    expect(segments()).toHaveLength(4);
    expect(reached()).toEqual([true, false, false, false]);

    await user.click(screen.getByRole("radio", { name: /Small patch/ }));
    flush();
    await user.click(screen.getByRole("button", { name: "Next" }));
    flush();
    expect(bar.textContent).toBe("Checkpoint 2 of 4");
    expect(reached()).toEqual([true, true, false, false]);
  });

  test("a skipped question is reported as skipped", async () => {
    render(() => (
      <>
        <Toaster />
        <QuestionnaireSkipExample />
      </>
    ));
    await user.click(screen.getByRole("radio", { name: /Bug fix/ }));
    flush();
    await user.click(screen.getByRole("button", { name: "Next" }));
    flush();
    await user.click(screen.getByRole("button", { name: "Skip" }));
    flush();
    await user.click(screen.getByRole("radio", { name: /Review the final diff/ }));
    flush();
    await user.click(screen.getByRole("button", { name: "Submit brief" }));
    flush();
    expect(toastText()).toContain("Task: fix · Constraints: Skipped · Review: diff");
  });

  test("the validation counter says which of the two questions is showing", async () => {
    render(() => <QuestionnaireValidation />);
    expect(screen.getByRole("progressbar").textContent).toBe("1 / 2");
    await user.click(screen.getByRole("radio", { name: /Concise summary/ }));
    flush();
    await user.click(screen.getByRole("button", { name: "Next" }));
    flush();
    expect(screen.getByRole("progressbar").textContent).toBe("2 / 2");
  });

  test("a summary for the public is sent back to the first question", async () => {
    render(() => <QuestionnaireValidation />);
    await user.click(screen.getByRole("radio", { name: /Concise summary/ }));
    flush();
    await user.click(screen.getByRole("button", { name: "Next" }));
    flush();
    await user.click(screen.getByRole("radio", { name: /Public audience/ }));
    flush();
    await user.click(screen.getByRole("button", { name: "Validate answers" }));
    flush();
    expect(screen.getByRole("alert").textContent).toBe(
      "Public answers need enough context. Choose a complete answer.",
    );
    expect(screen.getByText("How much detail should the answer include?")).toBeTruthy();
  });
});
