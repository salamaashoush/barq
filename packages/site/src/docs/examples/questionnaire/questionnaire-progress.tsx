import { Repeat } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
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
  { name: "strategy", required: true },
  { name: "tests", required: true },
  { name: "delivery", required: true },
];

const frame = css`
  margin-inline: auto;
  max-width: 28rem;
`;

const full = css`
  width: 100%;
`;

const segments = css`
  margin-bottom: calc(var(--spacing) * 2);
  display: flex;
  gap: calc(var(--spacing) * 1.5);
`;

const segment = css`
  height: calc(var(--spacing) * 1.5);
  flex: 1;
  border-radius: calc(infinity * 1px);
  background-color: var(--muted);
`;

const reached = css`
  height: calc(var(--spacing) * 1.5);
  flex: 1;
  border-radius: calc(infinity * 1px);
  background-color: var(--primary);
`;

const answer = (entry: FormDataEntryValue | null, none = "None"): string =>
  typeof entry === "string" && entry !== "" ? entry : none;

export default function QuestionnaireProgressExample() {
  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    toast("Pull request plan ready", {
      description: `Scope: ${answer(data.get("scope"))} · Commits: ${answer(data.get("strategy"))} · Tests: ${answer(data.get("tests"))} · Delivery: ${answer(data.get("delivery"))}`,
    });
  }

  return (
    <Questionnaire class={frame} defaultItem="scope" items={items} onSubmit={handleSubmit}>
      <QuestionnaireProgress
        class={full}
        render={(part, state) => (
          <div {...part.props} ref={part.ref}>
            <div class={segments} aria-hidden="true">
              <Repeat count={state.total()}>
                {(index) => <span class={index < state.current() ? reached : segment} />}
              </Repeat>
            </div>
            <span>
              Checkpoint {state.current()} of {state.total()}
            </span>
          </div>
        )}
      />

      <QuestionnaireItem name="scope" required>
        <QuestionnaireTitle>How large is the change?</QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="small">Small patch</QuestionnaireChoice>
          <QuestionnaireChoice value="medium">Feature-sized change</QuestionnaireChoice>
          <QuestionnaireChoice value="large">Cross-package change</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireItem name="strategy" required>
        <QuestionnaireTitle>How should commits be organized?</QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="single">Single commit</QuestionnaireChoice>
          <QuestionnaireChoice value="logical">Logical commits</QuestionnaireChoice>
          <QuestionnaireChoice value="squash">Squash before review</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireItem name="tests" required>
        <QuestionnaireTitle>Which tests should run?</QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="targeted">Targeted tests</QuestionnaireChoice>
          <QuestionnaireChoice value="package">Package suite</QuestionnaireChoice>
          <QuestionnaireChoice value="workspace">Full workspace</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireItem name="delivery" required>
        <QuestionnaireTitle>How should the work be delivered?</QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="patch">Patch only</QuestionnaireChoice>
          <QuestionnaireChoice value="commit">Committed locally</QuestionnaireChoice>
          <QuestionnaireChoice value="branch">Push a review branch</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>

      <QuestionnaireActions>
        <QuestionnairePrevious />
        <QuestionnaireNext>Next</QuestionnaireNext>
        <QuestionnaireSubmit>Finish plan</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  );
}
