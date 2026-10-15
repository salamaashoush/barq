import { css } from "@barqjs/css";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
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
  {
    choices: [{ value: "fix" }, { value: "refactor" }, { value: "docs" }],
    name: "task",
    required: true,
  },
  {
    choices: [{ value: "summary" }, { value: "files" }, { value: "review" }],
    name: "output",
    required: true,
  },
];

const frame = css`
  margin-inline: auto;
  max-width: 28rem;
`;

const full = css`
  width: 100%;
`;

const answer = (entry: FormDataEntryValue | null, none = "None"): string =>
  typeof entry === "string" && entry !== "" ? entry : none;

export default function QuestionnaireCard() {
  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    toast("Agent task created", {
      description: `Task: ${answer(data.get("task"))} · Handoff: ${answer(data.get("output"))}`,
    });
  }

  return (
    <Questionnaire
      class={frame}
      defaultItem="task"
      items={items}
      shortcuts="numbers"
      onSubmit={handleSubmit}
    >
      <Card>
        <QuestionnaireItem aria-labelledby="questionnaire-card-task" name="task" required>
          <CardHeader>
            <CardTitle>
              <QuestionnaireTitle id="questionnaire-card-task">
                What should the agent work on?
              </QuestionnaireTitle>
            </CardTitle>
            <CardDescription>
              <QuestionnaireDescription>
                Choose the task that should be handled next.
              </QuestionnaireDescription>
            </CardDescription>
            <CardAction>
              <QuestionnaireProgress />
            </CardAction>
          </CardHeader>
          <CardContent>
            <QuestionnaireChoices>
              <QuestionnaireChoice value="fix">Fix the failing tests</QuestionnaireChoice>
              <QuestionnaireChoice value="refactor">Refactor the data layer</QuestionnaireChoice>
              <QuestionnaireChoice value="docs">Update the integration guide</QuestionnaireChoice>
            </QuestionnaireChoices>
            <QuestionnaireError />
          </CardContent>
        </QuestionnaireItem>
        <QuestionnaireItem aria-labelledby="questionnaire-card-output" name="output" required>
          <CardHeader>
            <CardTitle>
              <QuestionnaireTitle id="questionnaire-card-output">
                What should the final handoff include?
              </QuestionnaireTitle>
            </CardTitle>
            <CardDescription>
              <QuestionnaireDescription>
                Pick the level of detail needed for review.
              </QuestionnaireDescription>
            </CardDescription>
            <CardAction>
              <QuestionnaireProgress />
            </CardAction>
          </CardHeader>
          <CardContent>
            <QuestionnaireChoices>
              <QuestionnaireChoice value="summary">Summary only</QuestionnaireChoice>
              <QuestionnaireChoice value="files">Summary and changed files</QuestionnaireChoice>
              <QuestionnaireChoice value="review">Full review handoff</QuestionnaireChoice>
            </QuestionnaireChoices>
            <QuestionnaireError />
          </CardContent>
        </QuestionnaireItem>
        <CardFooter>
          <QuestionnaireActions class={full}>
            <QuestionnairePrevious />
            <QuestionnaireNext>Next</QuestionnaireNext>
            <QuestionnaireSubmit>Create task</QuestionnaireSubmit>
          </QuestionnaireActions>
        </CardFooter>
      </Card>
    </Questionnaire>
  );
}
