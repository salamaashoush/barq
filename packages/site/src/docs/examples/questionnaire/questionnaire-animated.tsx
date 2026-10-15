import { css } from "@barqjs/css";
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSubmit,
  QuestionnaireTitle,
  toast,
} from "@barqjs/ui";

const items = [
  { name: "task", required: true },
  { name: "review", required: true },
  { name: "delivery", required: true },
];

const frame = css`
  margin-inline: auto;
  max-width: 28rem;
`;

const entering = css`
  &[data-active] {
    animation: questionnaire-enter 300ms ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    &[data-active] {
      animation: none;
    }
  }

  @keyframes questionnaire-enter {
    from {
      opacity: 0;
      transform: translateY(calc(var(--spacing) * 2));
    }
  }
`;

const answer = (entry: FormDataEntryValue | null, none = "None"): string =>
  typeof entry === "string" && entry !== "" ? entry : none;

export default function QuestionnaireAnimated() {
  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    toast("Agent workflow saved", {
      description: `Task: ${answer(data.get("task"))} · Review: ${answer(data.get("review"))} · Delivery: ${answer(data.get("delivery"))}`,
    });
  }

  return (
    <Questionnaire class={frame} defaultItem="task" items={items} onSubmit={handleSubmit}>
      <QuestionnaireProgress />
      <QuestionnaireItem name="task" required class={entering}>
        <QuestionnaireTitle>What should the agent do?</QuestionnaireTitle>
        <QuestionnaireDescription>Choose the task for this run.</QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="implement">
            Implement the requested change
          </QuestionnaireChoice>
          <QuestionnaireChoice value="debug">Debug the current behavior</QuestionnaireChoice>
          <QuestionnaireChoice value="review">Review the implementation</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireItem name="review" required class={entering}>
        <QuestionnaireTitle>How should the work be reviewed?</QuestionnaireTitle>
        <QuestionnaireDescription>Select the verification depth.</QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="targeted">Targeted checks</QuestionnaireChoice>
          <QuestionnaireChoice value="complete">Complete test suite</QuestionnaireChoice>
          <QuestionnaireChoice value="manual">Tests and manual QA</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireItem name="delivery" required class={entering}>
        <QuestionnaireTitle>How should the result be delivered?</QuestionnaireTitle>
        <QuestionnaireDescription>Choose the final handoff format.</QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="summary">Concise summary</QuestionnaireChoice>
          <QuestionnaireChoice value="diff">Summary and changed files</QuestionnaireChoice>
          <QuestionnaireChoice value="handoff">Detailed review handoff</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireActions>
        <QuestionnairePrevious />
        <QuestionnaireNext>Next</QuestionnaireNext>
        <QuestionnaireSubmit>Save workflow</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  );
}
