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
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSubmit,
  QuestionnaireTitle,
  toast,
} from "@barqjs/ui";

const items = [
  { name: "scope", required: true },
  { name: "checks", required: true },
  { name: "output", required: true },
];

const itemLabels: Record<string, string> = {
  scope: "Change scope",
  checks: "Verification",
  output: "Final output",
};

const shell = css`
  position: relative;
  margin-inline: auto;
  display: flex;
  height: 100%;
  width: 100%;
  max-width: 28rem;
  flex-direction: column;
`;

const status = css`
  position: absolute;
  inset-inline-end: 0;
  top: 0;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

const bottom = css`
  margin-top: auto;
`;

const answer = (entry: FormDataEntryValue | null, none = "None"): string =>
  typeof entry === "string" && entry !== "" ? entry : none;

export default function QuestionnaireControlled() {
  const [item, setItem] = createSignal("scope");

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    toast("Agent workflow configured", {
      description: `Scope: ${answer(data.get("scope"))} · Verification: ${answer(data.get("checks"))} · Output: ${answer(data.get("output"))}`,
    });
  }

  return (
    <div class={shell}>
      <p class={status} role="status">
        Current checkpoint: {itemLabels[item()]}
      </p>
      <Questionnaire
        class={bottom}
        item={item()}
        items={items}
        onItemChange={setItem}
        onSubmit={handleSubmit}
      >
        <QuestionnaireProgress />
        <QuestionnaireItem name="scope" required>
          <QuestionnaireTitle>What may the agent change?</QuestionnaireTitle>
          <QuestionnaireDescription>
            The host stores the active checkpoint while Questionnaire navigates.
          </QuestionnaireDescription>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="component">Only the target component</QuestionnaireChoice>
            <QuestionnaireChoice value="tests">Component and related tests</QuestionnaireChoice>
            <QuestionnaireChoice value="feature">The complete feature area</QuestionnaireChoice>
          </QuestionnaireChoices>
          <QuestionnaireError />
        </QuestionnaireItem>
        <QuestionnaireItem name="checks" required>
          <QuestionnaireTitle>Which verification level should it use?</QuestionnaireTitle>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="targeted">Targeted tests</QuestionnaireChoice>
            <QuestionnaireChoice value="package">Package tests and typecheck</QuestionnaireChoice>
            <QuestionnaireChoice value="full">Full workspace verification</QuestionnaireChoice>
          </QuestionnaireChoices>
          <QuestionnaireError />
        </QuestionnaireItem>
        <QuestionnaireItem name="output" required>
          <QuestionnaireTitle>What should the agent return when finished?</QuestionnaireTitle>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="summary">Concise summary</QuestionnaireChoice>
            <QuestionnaireChoice value="diff">Summary with changed files</QuestionnaireChoice>
            <QuestionnaireChoice value="handoff">
              Detailed implementation handoff
            </QuestionnaireChoice>
          </QuestionnaireChoices>
          <QuestionnaireError />
        </QuestionnaireItem>
        <QuestionnaireActions>
          <QuestionnairePrevious />
          <QuestionnaireNext>Next</QuestionnaireNext>
          <QuestionnaireSubmit>Save workflow</QuestionnaireSubmit>
        </QuestionnaireActions>
      </Questionnaire>
    </div>
  );
}
