import QuestionnaireSkip from "./questionnaire-skip.tsx";
import questionnaireSkip from "./questionnaire-skip.tsx?raw";
import QuestionnaireConditional from "./questionnaire-conditional.tsx";
import questionnaireConditional from "./questionnaire-conditional.tsx?raw";
import QuestionnaireControlled from "./questionnaire-controlled.tsx";
import questionnaireControlled from "./questionnaire-controlled.tsx?raw";
import QuestionnaireNavigationState from "./questionnaire-navigation-state.tsx";
import questionnaireNavigationState from "./questionnaire-navigation-state.tsx?raw";
import QuestionnaireProgress from "./questionnaire-progress.tsx";
import questionnaireProgress from "./questionnaire-progress.tsx?raw";
import QuestionnaireResume from "./questionnaire-resume.tsx";
import questionnaireResume from "./questionnaire-resume.tsx?raw";
import QuestionnaireShortcuts from "./questionnaire-shortcuts.tsx";
import questionnaireShortcuts from "./questionnaire-shortcuts.tsx?raw";
import QuestionnaireValidation from "./questionnaire-validation.tsx";
import questionnaireValidation from "./questionnaire-validation.tsx?raw";
import QuestionnaireCard from "./questionnaire-card.tsx";
import questionnaireCard from "./questionnaire-card.tsx?raw";
import QuestionnaireDialog from "./questionnaire-dialog.tsx";
import questionnaireDialog from "./questionnaire-dialog.tsx?raw";
import QuestionnaireAnimated from "./questionnaire-animated.tsx";
import questionnaireAnimated from "./questionnaire-animated.tsx?raw";
import type { ComponentDoc, Demo } from "../../registry.ts";
import QuestionnaireDemo from "./questionnaire-demo.tsx";
import questionnaireDemo from "./questionnaire-demo.tsx?raw";
import QuestionnaireFreeform from "./questionnaire-freeform.tsx";
import questionnaireFreeform from "./questionnaire-freeform.tsx?raw";
import QuestionnaireMultiple from "./questionnaire-multiple.tsx";
import questionnaireMultiple from "./questionnaire-multiple.tsx?raw";

export const demos: readonly Demo[] = [
  {
    align: "start",
    size: "auto",
    code: questionnaireDemo,
    component: QuestionnaireDemo,
  },
  {
    title: "Multiple Selection",
    note: "Add `multiple` to a `QuestionnaireItem` to let it take more than one answer. Each choice is then a checkbox, and the form carries one value per choice.",
    align: "start",
    size: "auto",
    code: questionnaireMultiple,
    component: QuestionnaireMultiple,
  },
  {
    title: "Freeform Answer",
    note: "Put a `QuestionnaireInput` after the choices to accept an answer none of them covers. Typing in it selects it.",
    align: "start",
    size: "auto",
    code: questionnaireFreeform,
    component: QuestionnaireFreeform,
  },
  {
    title: "Skip",
    note: "An optional question can be skipped with `QuestionnaireSkip`; `onStatusChange` reports whether it was answered or skipped.",
    align: "start",
    size: "auto",
    code: questionnaireSkip,
    component: QuestionnaireSkip,
  },
  {
    title: "Conditional Questions",
    note: "Disable a `QuestionnaireItem` to take it out of the flow. Here the environment question only applies to cloud runs.",
    align: "start",
    size: "auto",
    code: questionnaireConditional,
    component: QuestionnaireConditional,
  },
  {
    title: "Controlled",
    note: "Use `item` and `onItemChange` to own the active question.",
    align: "start",
    size: "auto",
    code: questionnaireControlled,
    component: QuestionnaireControlled,
  },
  {
    title: "Navigation State",
    note: "Read each question's status with `onStatusChange` to gate the navigation buttons.",
    align: "start",
    size: "auto",
    code: questionnaireNavigationState,
    component: QuestionnaireNavigationState,
  },
  {
    title: "Custom Progress",
    note: "Give `QuestionnaireProgress` a `render` to draw your own indicator. Its state carries `current`, `total`, `first` and `last`.",
    align: "start",
    size: "auto",
    code: questionnaireProgress,
    component: QuestionnaireProgress,
  },
  {
    title: "Resume",
    note: "Restore saved answers with `defaultChecked` and `defaultValue`, open at a later question with `defaultItem`, and reset to the saved draft with a reset button.",
    align: "start",
    size: "auto",
    code: questionnaireResume,
    component: QuestionnaireResume,
  },
  {
    title: "Shortcuts",
    note: 'Use `shortcuts="letters"` or `shortcuts="numbers"` to show keyboard shortcuts on each choice.',
    align: "start",
    size: "auto",
    code: questionnaireShortcuts,
    component: QuestionnaireShortcuts,
  },
  {
    title: "Validation",
    note: "Validate the submitted answers yourself and mark a question with `invalid`, moving to the first one that failed.",
    align: "start",
    size: "auto",
    code: questionnaireValidation,
    component: QuestionnaireValidation,
  },
  {
    title: "Card",
    note: "Compose the questionnaire inside a `Card`. Each item is labelled by its title through `aria-labelledby`.",
    align: "start",
    size: "auto",
    code: questionnaireCard,
    component: QuestionnaireCard,
  },
  {
    title: "Dialog",
    note: "Put a questionnaire in a `Dialog` to ask for clarification without leaving the page.",
    align: "start",
    size: "auto",
    code: questionnaireDialog,
    component: QuestionnaireDialog,
  },
  {
    title: "Animated",
    note: "The active question carries `data-active`, which an entry animation can key off.",
    align: "start",
    size: "auto",
    code: questionnaireAnimated,
    component: QuestionnaireAnimated,
  },
];

export const doc: ComponentDoc = {
  slug: "questionnaire",
  title: "Questionnaire",
  description:
    "A multi-step questionnaire with single-choice, multiple-choice, freeform, and skippable questions.",
  usage:
    'import {\n  Questionnaire,\n  QuestionnaireActions,\n  QuestionnaireChoice,\n  QuestionnaireChoices,\n  QuestionnaireItem,\n  QuestionnaireSubmit,\n  QuestionnaireTitle,\n} from "@barqjs/ui";\n\n<Questionnaire onSubmit={save}>\n  <QuestionnaireItem name="plan" required>\n    <QuestionnaireTitle>Choose a plan</QuestionnaireTitle>\n    <QuestionnaireChoices>\n      <QuestionnaireChoice value="plus">Plus</QuestionnaireChoice>\n      <QuestionnaireChoice value="pro">Pro</QuestionnaireChoice>\n    </QuestionnaireChoices>\n  </QuestionnaireItem>\n  <QuestionnaireActions>\n    <QuestionnaireSubmit>Save</QuestionnaireSubmit>\n  </QuestionnaireActions>\n</Questionnaire>',
  demos,
};
