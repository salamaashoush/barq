import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
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
  { name: "detail", required: true },
  { name: "audience", required: true },
];

type ItemName = "detail" | "audience";
type Errors = Partial<Record<ItemName, string>>;

interface Answers {
  readonly detail: "summary" | "complete";
  readonly audience: "team" | "public";
}

/** The schema: both answers present, and a public answer is a complete one. */
function validate(data: FormData): { answers: Answers } | { errors: Errors; first: ItemName } {
  const detail = data.get("detail");
  const audience = data.get("audience");
  const errors: Errors = {};
  if (detail !== "summary" && detail !== "complete")
    errors.detail = "Choose an answer to continue.";
  if (audience !== "team" && audience !== "public") {
    errors.audience = "Choose an answer to continue.";
  }
  if (audience === "public" && detail === "summary") {
    errors.detail = "Public answers need enough context. Choose a complete answer.";
  }
  const first = (Object.keys(errors) as ItemName[])[0];
  if (first !== undefined) return { errors, first };
  return { answers: { detail, audience } as Answers };
}

const frame = css`
  margin-inline: auto;
  max-width: 28rem;
`;

const full = css`
  width: 100%;
`;

const counter = css`
  min-width: 0;
`;

function ValidationProgress() {
  return (
    <QuestionnaireProgress
      class={counter}
      render={(part, state) => (
        <div {...part.props} ref={part.ref}>
          {state.current()} / {state.total()}
        </div>
      )}
    />
  );
}

export default function QuestionnaireValidation() {
  const [item, setItem] = createSignal("detail");
  const [errors, setErrors] = createSignal<Errors>({});

  function clearError(name: ItemName) {
    if (errors()[name] === undefined) return;
    const next = { ...errors() };
    delete next[name];
    setErrors(next);
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const result = validate(new FormData(event.currentTarget as HTMLFormElement));
    if ("answers" in result) {
      setErrors({});
      toast("Agent response configured", {
        description: `Detail: ${result.answers.detail} · Audience: ${result.answers.audience}`,
      });
      return;
    }
    setErrors(result.errors);
    setItem(result.first);
  }

  return (
    <Questionnaire
      class={frame}
      item={item()}
      items={items}
      onItemChange={setItem}
      onSubmit={handleSubmit}
    >
      <Card class={full}>
        <QuestionnaireItem invalid={errors().detail !== undefined} name="detail" required>
          <CardHeader>
            <QuestionnaireTitle>How much detail should the answer include?</QuestionnaireTitle>
            <QuestionnaireDescription>Choose the response depth.</QuestionnaireDescription>
            <CardAction>
              <ValidationProgress />
            </CardAction>
          </CardHeader>
          <CardContent>
            <QuestionnaireChoices>
              <QuestionnaireChoice value="summary" onChange={() => clearError("detail")}>
                Concise summary
              </QuestionnaireChoice>
              <QuestionnaireChoice value="complete" onChange={() => clearError("detail")}>
                Complete answer
              </QuestionnaireChoice>
            </QuestionnaireChoices>
            <QuestionnaireError>{errors().detail}</QuestionnaireError>
          </CardContent>
        </QuestionnaireItem>
        <QuestionnaireItem invalid={errors().audience !== undefined} name="audience" required>
          <CardHeader>
            <QuestionnaireTitle>Who will read the answer?</QuestionnaireTitle>
            <QuestionnaireDescription>
              Public answers require complete context.
            </QuestionnaireDescription>
            <CardAction>
              <ValidationProgress />
            </CardAction>
          </CardHeader>
          <CardContent>
            <QuestionnaireChoices>
              <QuestionnaireChoice value="team" onChange={() => clearError("audience")}>
                My team
              </QuestionnaireChoice>
              <QuestionnaireChoice value="public" onChange={() => clearError("audience")}>
                Public audience
              </QuestionnaireChoice>
            </QuestionnaireChoices>
            <QuestionnaireError>{errors().audience}</QuestionnaireError>
          </CardContent>
        </QuestionnaireItem>
        <CardFooter>
          <QuestionnaireActions>
            <QuestionnairePrevious />
            <QuestionnaireNext>Next</QuestionnaireNext>
            <QuestionnaireSubmit>Validate answers</QuestionnaireSubmit>
          </QuestionnaireActions>
        </CardFooter>
      </Card>
    </Questionnaire>
  );
}
