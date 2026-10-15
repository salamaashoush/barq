import { css } from "@barqjs/css";
import {
  Button,
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
  QuestionnaireSubmit,
  QuestionnaireTitle,
  toast,
} from "@barqjs/ui";

const items = [
  { name: "change", required: true },
  { name: "verification", required: true },
  { name: "notes" },
];

const frame = css`
  margin-inline: auto;
  max-width: 28rem;
`;

const answer = (entry: FormDataEntryValue | null, none = "None"): string =>
  typeof entry === "string" && entry !== "" ? entry : none;

export default function QuestionnaireResume() {
  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const verification = data.getAll("verification").filter((entry) => typeof entry === "string");
    toast("Draft updated", {
      description: `Migration: ${answer(data.get("change"))} · Verification: ${verification.join(", ") || "None"} · Notes: ${answer(data.get("notes"))}`,
    });
  }

  return (
    <Questionnaire
      class={frame}
      defaultItem="verification"
      items={items}
      onReset={() => {
        toast("Saved answers restored");
      }}
      onSubmit={handleSubmit}
    >
      <QuestionnaireProgress />
      <QuestionnaireItem name="change" required>
        <QuestionnaireTitle>What kind of migration is this?</QuestionnaireTitle>
        <QuestionnaireDescription>
          This answer was saved during the previous session.
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="incremental" defaultChecked>
            Incremental migration
          </QuestionnaireChoice>
          <QuestionnaireChoice value="cutover">Single cutover</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireItem name="verification" multiple required>
        <QuestionnaireTitle>How should the migration be verified?</QuestionnaireTitle>
        <QuestionnaireDescription>
          These checks were selected during the previous session.
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="tests" defaultChecked>
            Run migration tests
          </QuestionnaireChoice>
          <QuestionnaireChoice value="typecheck" defaultChecked>
            Run the typecheck
          </QuestionnaireChoice>
          <QuestionnaireChoice value="manual">Perform a manual smoke test</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireItem name="notes">
        <QuestionnaireTitle>Anything else the agent should remember?</QuestionnaireTitle>
        <QuestionnaireDescription>This note was saved with the draft.</QuestionnaireDescription>
        <QuestionnaireInput
          aria-label="Saved migration note"
          defaultValue="Keep the existing public API stable."
        />
      </QuestionnaireItem>
      <QuestionnaireActions>
        <Button type="reset" variant="outline">
          Reset changes
        </Button>
        <QuestionnairePrevious />
        <QuestionnaireNext>Next</QuestionnaireNext>
        <QuestionnaireSubmit>Update draft</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  );
}
