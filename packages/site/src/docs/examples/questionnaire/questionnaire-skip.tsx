import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
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
  toast,
  type QuestionnaireItemStatus,
} from "@barqjs/ui";

const items = [
  { name: "task", required: true },
  { name: "constraints" },
  { name: "review", required: true },
];

const frame = css`
  margin-inline: auto;
  max-width: 28rem;
`;

const answer = (entry: FormDataEntryValue | null, none = "None"): string =>
  typeof entry === "string" && entry !== "" ? entry : none;

export default function QuestionnaireSkipExample() {
  const [constraintStatus, setConstraintStatus] =
    createSignal<QuestionnaireItemStatus>("unanswered");

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const constraints =
      constraintStatus() === "skipped" ? "Skipped" : answer(data.get("constraints"));
    toast("Agent brief submitted", {
      description: `Task: ${answer(data.get("task"))} · Constraints: ${constraints} · Review: ${answer(data.get("review"))}`,
    });
  }

  return (
    <Questionnaire class={frame} defaultItem="task" items={items} onSubmit={handleSubmit}>
      <QuestionnaireProgress />
      <QuestionnaireItem name="task" required>
        <QuestionnaireTitle>What kind of change is this?</QuestionnaireTitle>
        <QuestionnaireDescription>
          Choose the category that best describes the work.
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="feature">New feature</QuestionnaireChoice>
          <QuestionnaireChoice value="fix">Bug fix</QuestionnaireChoice>
          <QuestionnaireChoice value="refactor">Refactor</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireItem name="constraints" onStatusChange={setConstraintStatus}>
        <QuestionnaireTitle>Are there any implementation constraints?</QuestionnaireTitle>
        <QuestionnaireDescription>
          Answer if needed, or intentionally skip this question.
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="no-dependencies">Do not add dependencies</QuestionnaireChoice>
          <QuestionnaireChoice value="no-migrations">
            Do not change the database
          </QuestionnaireChoice>
          <QuestionnaireChoice value="preserve-api">Preserve the public API</QuestionnaireChoice>
          <QuestionnaireInput
            aria-label="Another implementation constraint"
            placeholder="Describe another constraint…"
          />
        </QuestionnaireChoices>
      </QuestionnaireItem>
      <QuestionnaireItem name="review" required>
        <QuestionnaireTitle>How should the work be reviewed?</QuestionnaireTitle>
        <QuestionnaireDescription>
          Choose the checks the agent should complete before handoff.
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="tests">Run the test suite</QuestionnaireChoice>
          <QuestionnaireChoice value="diff">Review the final diff</QuestionnaireChoice>
          <QuestionnaireChoice value="both">Tests and diff review</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireActions>
        <QuestionnairePrevious />
        <QuestionnaireSkip />
        <QuestionnaireNext>Next</QuestionnaireNext>
        <QuestionnaireSubmit>Submit brief</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  );
}
