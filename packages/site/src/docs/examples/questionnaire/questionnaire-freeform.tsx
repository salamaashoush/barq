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

export default function QuestionnaireFreeform() {
  const [saved, setSaved] = createSignal("");

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const approach = new FormData(event.currentTarget as HTMLFormElement).get("approach");
    setSaved(`Approach: ${answer(approach)}`);
  }

  return (
    <div class={frame}>
      <Questionnaire shortcuts="letters" onSubmit={handleSubmit}>
        <QuestionnaireItem name="approach" required>
          <QuestionnaireTitle>How should the agent approach this refactor?</QuestionnaireTitle>
          <QuestionnaireDescription>
            Choose a strategy or write a more specific instruction.
          </QuestionnaireDescription>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="incremental">
              Make the smallest safe change
            </QuestionnaireChoice>
            <QuestionnaireChoice value="module">Refactor one module at a time</QuestionnaireChoice>
            <QuestionnaireChoice value="rewrite">
              Replace the implementation completely
            </QuestionnaireChoice>
            <QuestionnaireInput
              aria-label="Another refactoring approach"
              placeholder="Describe another approach…"
            />
          </QuestionnaireChoices>
          <QuestionnaireError />
        </QuestionnaireItem>
        <QuestionnaireActions>
          <QuestionnaireSubmit>Use this approach</QuestionnaireSubmit>
        </QuestionnaireActions>
      </Questionnaire>
      <output class={result}>{saved()}</output>
    </div>
  );
}
