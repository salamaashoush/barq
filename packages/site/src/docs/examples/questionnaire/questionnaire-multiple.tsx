import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
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

const answers = (entries: readonly FormDataEntryValue[]): string =>
  entries.filter((entry) => typeof entry === "string").join(", ") || "None";

export default function QuestionnaireMultiple() {
  const [saved, setSaved] = createSignal("");

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const context = new FormData(event.currentTarget as HTMLFormElement).getAll("context");
    setSaved(`Context: ${answers(context)}`);
  }

  return (
    <div class={frame}>
      <Questionnaire shortcuts="letters" onSubmit={handleSubmit}>
        <QuestionnaireItem name="context" multiple required>
          <QuestionnaireTitle>What context should the agent inspect?</QuestionnaireTitle>
          <QuestionnaireDescription>
            Select every source that may affect the implementation.
          </QuestionnaireDescription>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="source">Relevant source files</QuestionnaireChoice>
            <QuestionnaireChoice value="tests">Existing tests</QuestionnaireChoice>
            <QuestionnaireChoice value="docs">Architecture documentation</QuestionnaireChoice>
            <QuestionnaireChoice value="history">Recent commit history</QuestionnaireChoice>
          </QuestionnaireChoices>
          <QuestionnaireError />
        </QuestionnaireItem>
        <QuestionnaireActions>
          <QuestionnaireSubmit>Share context</QuestionnaireSubmit>
        </QuestionnaireActions>
      </Questionnaire>
      <output class={result}>{saved()}</output>
    </div>
  );
}
