import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
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
} from "@barqjs/ui";

const frame = css`
  margin-inline: auto;
  display: grid;
  width: 100%;
  max-width: 28rem;
  gap: calc(var(--spacing) * 4);
`;

const result = css`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

const answer = (entry: FormDataEntryValue | null): string =>
  typeof entry === "string" ? entry : "None";

const answers = (entries: readonly FormDataEntryValue[]): string =>
  entries.filter((entry) => typeof entry === "string").join(", ") || "None";

export default function QuestionnaireDemo() {
  const [saved, setSaved] = createSignal("");

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    setSaved(
      `Agent plan saved. Direction: ${answer(data.get("direction"))} · Progress signals: ${answers(data.getAll("signals"))} · Timing: ${answer(data.get("timing"))}`,
    );
  }

  return (
    <div class={frame}>
      <Questionnaire shortcuts="letters" onSubmit={handleSubmit}>
        <QuestionnaireProgress />
        <QuestionnaireItem name="direction" required>
          <QuestionnaireTitle>What should the agent build next?</QuestionnaireTitle>
          <QuestionnaireDescription>
            Choose a direction or describe another task.
          </QuestionnaireDescription>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="tool-calls">
              <span>Tool call timeline</span>
              <QuestionnaireChoiceDescription>
                Show what the agent ran and what came back.
              </QuestionnaireChoiceDescription>
            </QuestionnaireChoice>
            <QuestionnaireChoice value="approvals">
              <span>Approval checkpoints</span>
              <QuestionnaireChoiceDescription>
                Ask before sensitive or destructive actions.
              </QuestionnaireChoiceDescription>
            </QuestionnaireChoice>
            <QuestionnaireChoice value="handoffs">
              <span>Sub-agent handoffs</span>
              <QuestionnaireChoiceDescription>
                Make delegated work and results easier to follow.
              </QuestionnaireChoiceDescription>
            </QuestionnaireChoice>
            <QuestionnaireInput
              aria-label="Another agent feature"
              placeholder="Describe another feature…"
            />
          </QuestionnaireChoices>
          <QuestionnaireError />
        </QuestionnaireItem>
        <QuestionnaireItem name="signals" multiple>
          <QuestionnaireTitle>What should every progress update include?</QuestionnaireTitle>
          <QuestionnaireDescription>
            Select all that apply, or skip this question.
          </QuestionnaireDescription>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="progress">Progress</QuestionnaireChoice>
            <QuestionnaireChoice value="decisions">Decisions</QuestionnaireChoice>
            <QuestionnaireChoice value="risks">Risks</QuestionnaireChoice>
            <QuestionnaireChoice value="next-step">Next step</QuestionnaireChoice>
          </QuestionnaireChoices>
          <QuestionnaireError />
        </QuestionnaireItem>
        <QuestionnaireItem name="timing" required>
          <QuestionnaireTitle>When should work begin?</QuestionnaireTitle>
          <QuestionnaireDescription>
            Choose when the agent should begin the work.
          </QuestionnaireDescription>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="now">Start now</QuestionnaireChoice>
            <QuestionnaireChoice value="next-cycle">Next development cycle</QuestionnaireChoice>
            <QuestionnaireChoice value="backlog">Add it to the backlog</QuestionnaireChoice>
          </QuestionnaireChoices>
          <QuestionnaireError />
        </QuestionnaireItem>
        <QuestionnaireActions>
          <QuestionnairePrevious />
          <QuestionnaireSkip />
          <QuestionnaireNext>Next</QuestionnaireNext>
          <QuestionnaireSubmit>Save plan</QuestionnaireSubmit>
        </QuestionnaireActions>
      </Questionnaire>
      <output class={result}>{saved()}</output>
    </div>
  );
}
