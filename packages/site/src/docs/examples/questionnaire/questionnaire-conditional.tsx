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

const frame = css`
  margin-inline: auto;
  max-width: 28rem;
`;

const answer = (entry: FormDataEntryValue | null, none = "None"): string =>
  typeof entry === "string" && entry !== "" ? entry : none;

export default function QuestionnaireConditional() {
  const [runtime, setRuntime] = createSignal("local");
  const items = () => [
    { name: "runtime", required: true },
    { disabled: runtime() !== "cloud", name: "environment", required: true },
    { name: "approval", required: true },
  ];

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    toast("Execution plan saved", {
      description: `Runtime: ${answer(data.get("runtime"))} · Environment: ${answer(data.get("environment"), "Not applicable")} · Approval: ${answer(data.get("approval"))}`,
    });
  }

  return (
    <Questionnaire class={frame} defaultItem="runtime" items={items()} onSubmit={handleSubmit}>
      <QuestionnaireProgress />
      <QuestionnaireItem name="runtime" required>
        <QuestionnaireTitle>Where should the agent run?</QuestionnaireTitle>
        <QuestionnaireDescription>
          Cloud runs add an environment question to this flow.
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice
            checked={runtime() === "local"}
            value="local"
            onChange={() => setRuntime("local")}
          >
            Local workspace
          </QuestionnaireChoice>
          <QuestionnaireChoice
            checked={runtime() === "cloud"}
            value="cloud"
            onChange={() => setRuntime("cloud")}
          >
            Cloud workspace
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireItem name="environment" required disabled={runtime() !== "cloud"}>
        <QuestionnaireTitle>Which cloud environment should it use?</QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="preview">Preview</QuestionnaireChoice>
          <QuestionnaireChoice value="staging">Staging</QuestionnaireChoice>
          <QuestionnaireChoice value="isolated">Isolated sandbox</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireItem name="approval" required>
        <QuestionnaireTitle>When should the agent request approval?</QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="writes">Before writing files</QuestionnaireChoice>
          <QuestionnaireChoice value="commands">Before running commands</QuestionnaireChoice>
          <QuestionnaireChoice value="sensitive">Only for sensitive actions</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireActions>
        <QuestionnairePrevious />
        <QuestionnaireNext>Next</QuestionnaireNext>
        <QuestionnaireSubmit>Save execution plan</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  );
}
