import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  NativeSelect,
  NativeSelectOption,
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireItem,
  QuestionnaireSubmit,
  QuestionnaireTitle,
  toast,
} from "@barqjs/ui";

const items = [
  {
    choices: [{ value: "inspect" }, { value: "tests" }, { value: "patch" }],
    name: "action",
    required: true,
  },
];

type ShortcutMode = "letters" | "numbers" | undefined;

const shell = css`
  position: relative;
  margin-inline: auto;
  display: flex;
  height: 100%;
  width: 100%;
  max-width: 28rem;
  flex-direction: column;
`;

const picker = css`
  position: absolute;
  inset-inline-end: 0;
  top: 0;
`;

const bottom = css`
  margin-top: auto;
`;

export default function QuestionnaireShortcuts() {
  const [shortcuts, setShortcuts] = createSignal<ShortcutMode>("letters");

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const action = new FormData(event.currentTarget as HTMLFormElement).get("action");
    toast("Next action selected", {
      description: `Action: ${typeof action === "string" ? action : "None"} · Shortcuts: ${shortcuts() ?? "none"}`,
    });
  }

  return (
    <div class={shell}>
      <NativeSelect
        aria-label="Shortcut style"
        class={picker}
        value={shortcuts() ?? "none"}
        onChange={(event: Event) => {
          const value = (event.currentTarget as HTMLSelectElement).value;
          setShortcuts(value === "letters" || value === "numbers" ? value : undefined);
        }}
      >
        <NativeSelectOption value="none">No shortcuts</NativeSelectOption>
        <NativeSelectOption value="letters">Letters</NativeSelectOption>
        <NativeSelectOption value="numbers">Numbers</NativeSelectOption>
      </NativeSelect>
      <Questionnaire class={bottom} items={items} shortcuts={shortcuts()} onSubmit={handleSubmit}>
        <QuestionnaireItem name="action" required>
          <QuestionnaireTitle>What should the agent do next?</QuestionnaireTitle>
          <QuestionnaireDescription>
            Use the displayed shortcut or navigate with the keyboard.
          </QuestionnaireDescription>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="inspect">Inspect the implementation</QuestionnaireChoice>
            <QuestionnaireChoice value="tests">Run the relevant tests</QuestionnaireChoice>
            <QuestionnaireChoice value="patch">Prepare the patch</QuestionnaireChoice>
          </QuestionnaireChoices>
          <QuestionnaireError />
        </QuestionnaireItem>
        <QuestionnaireActions>
          <QuestionnaireSubmit>Confirm action</QuestionnaireSubmit>
        </QuestionnaireActions>
      </Questionnaire>
    </div>
  );
}
