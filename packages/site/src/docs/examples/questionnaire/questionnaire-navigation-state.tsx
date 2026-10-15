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
  type QuestionnaireItemStatus,
} from "@barqjs/ui";

const items = [
  { name: "permission", required: true },
  { name: "verification", required: true },
];

type ItemName = "permission" | "verification";

const frame = css`
  margin-inline: auto;
  max-width: 28rem;
`;

const pending = css`
  &[data-status="unanswered"] {
    opacity: 0.5;
  }
`;

const answer = (entry: FormDataEntryValue | null, none = "None"): string =>
  typeof entry === "string" && entry !== "" ? entry : none;

export default function QuestionnaireNavigationState() {
  const [item, setItem] = createSignal<ItemName>("permission");
  const [statuses, setStatuses] = createSignal<Record<ItemName, QuestionnaireItemStatus>>({
    permission: "unanswered",
    verification: "unanswered",
  });
  const unanswered = (): boolean => statuses()[item()] === "unanswered";

  function setStatus(name: ItemName, status: QuestionnaireItemStatus) {
    setStatuses({ ...statuses(), [name]: status });
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    toast("Permissions saved", {
      description: `Permission: ${answer(data.get("permission"))} · Verification: ${answer(data.get("verification"))}`,
    });
  }

  return (
    <Questionnaire
      class={frame}
      item={item()}
      items={items}
      onItemChange={(next: string) => setItem(next as ItemName)}
      onSubmit={handleSubmit}
    >
      <QuestionnaireProgress />
      <QuestionnaireItem
        name="permission"
        required
        onStatusChange={(status: QuestionnaireItemStatus) => setStatus("permission", status)}
      >
        <QuestionnaireTitle>What may the agent modify?</QuestionnaireTitle>
        <QuestionnaireDescription>
          Next is intentionally disabled until an answer is selected.
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="files">Project files</QuestionnaireChoice>
          <QuestionnaireChoice value="tests">Project files and tests</QuestionnaireChoice>
          <QuestionnaireChoice value="config">Files, tests, and configuration</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireItem
        name="verification"
        required
        onStatusChange={(status: QuestionnaireItemStatus) => setStatus("verification", status)}
      >
        <QuestionnaireTitle>What must pass before completion?</QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="tests">Tests</QuestionnaireChoice>
          <QuestionnaireChoice value="types">Tests and types</QuestionnaireChoice>
          <QuestionnaireChoice value="all">Tests, types, and visual QA</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireActions>
        <QuestionnairePrevious />
        <QuestionnaireNext class={pending} disabled={unanswered()} variant="secondary">
          Next
        </QuestionnaireNext>
        <QuestionnaireSubmit disabled={unanswered()}>Save permissions</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  );
}
