import {
  Questionnaire as AriaQuestionnaire,
  QuestionnaireChoice as AriaQuestionnaireChoice,
  QuestionnaireChoiceInput as AriaQuestionnaireChoiceInput,
  QuestionnaireChoiceLabel as AriaQuestionnaireChoiceLabel,
  QuestionnaireChoices as AriaQuestionnaireChoices,
  QuestionnaireChoiceShortcut as AriaQuestionnaireChoiceShortcut,
  QuestionnaireDescription as AriaQuestionnaireDescription,
  QuestionnaireError as AriaQuestionnaireError,
  QuestionnaireInput as AriaQuestionnaireInput,
  QuestionnaireItem as AriaQuestionnaireItem,
  QuestionnaireNext as AriaQuestionnaireNext,
  QuestionnairePrevious as AriaQuestionnairePrevious,
  QuestionnaireProgress as AriaQuestionnaireProgress,
  QuestionnaireSkip as AriaQuestionnaireSkip,
  QuestionnaireSubmit as AriaQuestionnaireSubmit,
  QuestionnaireTitle as AriaQuestionnaireTitle,
  type QuestionnaireButtonProps,
  type QuestionnaireChoiceProps as AriaQuestionnaireChoiceProps,
  type QuestionnaireChoicesProps as AriaQuestionnaireChoicesProps,
  type QuestionnaireErrorProps as AriaQuestionnaireErrorProps,
  type QuestionnaireInputProps as AriaQuestionnaireInputProps,
  type QuestionnaireItemProps as AriaQuestionnaireItemProps,
  type QuestionnairePartProps,
  type QuestionnaireProgressProps as AriaQuestionnaireProgressProps,
  type QuestionnaireProps as AriaQuestionnaireProps,
} from "@barqjs/aria/questionnaire";
import type { Incoming } from "@barqjs/core";
import { firstThatWorks, layer } from "@barqjs/css";
import { Check } from "@barqjs/lucide/icons/check";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { buttonVariants, type ButtonSize, type ButtonVariant } from "./button.tsx";

export {
  type QuestionnaireChoiceDefinition,
  type QuestionnaireInputType,
  type QuestionnaireItemDefinition,
  type QuestionnaireItemStatus,
  type QuestionnaireShortcutMode,
} from "@barqjs/aria/questionnaire";

const ui = layer("barq.ui");

const root = ui({
  display: "flex",
  width: "100%",
  minWidth: "0px",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 6)",
});

const progress = ui({
  minHeight: "1lh",
  width: "fit-content",
  minWidth: "14ch",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  color: "var(--muted-foreground)",
  "--ui-numeric-spacing": "tabular-nums",
  fontVariantNumeric:
    "var(--ui-ordinal,) var(--ui-slashed-zero,) var(--ui-numeric-figure,) var(--ui-numeric-spacing,) var(--ui-numeric-fraction,)",
});

const item = ui({
  display: "flex",
  minWidth: "0px",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 5)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "0px",
  padding: "0px",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  // An inactive question is `hidden`, and `display: flex` above would
  // otherwise draw every question at once.
  "[hidden]": {
    display: "none",
  },
});

const title = ui({
  fontSize: "var(--text-base)",
  lineHeight: "var(--ui-leading, var(--text-base--line-height))",
  "--ui-font-weight": "var(--font-weight-semibold)",
  fontWeight: "var(--font-weight-semibold)",
  textWrap: "pretty",
  ":not(:has( ~ [data-slot=questionnaire-description]))": {
    marginBottom: "calc(var(--spacing) * 5)",
  },
});

const description = ui({
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  textWrap: "pretty",
  color: "var(--muted-foreground)",
});

const choices = ui({
  display: "grid",
  minWidth: "0px",
  gap: "calc(var(--spacing) * 3)",
});

const choice = ui({
  position: "relative",
  display: "flex",
  minHeight: "calc(var(--spacing) * 11)",
  cursor: "pointer",
  alignItems: "flex-start",
  gap: "calc(var(--spacing) * 3)",
  borderRadius: "calc(var(--radius) * 0.8)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  borderColor: "var(--input)",
  backgroundColor: "transparent",
  paddingInline: "calc(var(--spacing) * 4)",
  paddingBlock: "calc(var(--spacing) * 3.5)",
  textAlign: "start",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  transitionProperty:
    "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --ui-gradient-from, --ui-gradient-via, --ui-gradient-to",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  "-webkit-user-select": "none",
  userSelect: "none",
  "@media (hover: hover)": {
    ":hover": {
      backgroundColor: "var(--muted)",
    },
    "@supports (color: color-mix(in lab, red, red))": {
      ":hover": {
        backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
      },
    },
  },
  ":has( > input:focus-visible)": {
    borderColor: "var(--ring)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "var(--ring)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
    },
  },
  "[data-invalid]": {
    borderColor: "var(--destructive)",
  },
  ":is(.dark *)": {
    backgroundColor: "var(--input)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--input) 20%, transparent)",
    },
  },
  "[data-checked]": {
    borderColor: "var(--primary)",
    backgroundColor: "var(--muted)",
    "@supports (color: color-mix(in lab, red, red))": {
      borderColor: "color-mix(in oklab, var(--primary) 40%, transparent)",
    },
  },
  ":is(.dark *)[data-checked]": {
    backgroundColor: "var(--muted)",
  },
  "[data-disabled]": {
    pointerEvents: "none",
    cursor: "not-allowed",
    opacity: "50%",
  },
});

const choiceInput = ui({
  position: "absolute",
  inset: "0px",
  zIndex: "10",
  width: "100%",
  height: "100%",
  cursor: "pointer",
  opacity: "0%",
});

const indicator = ui({
  pointerEvents: "none",
  position: "relative",
  display: "flex",
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
  flexShrink: "0",
  "--ui-translate-y": "calc(var(--spacing) * 0.45)",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "4px",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  borderColor: "var(--input)",
  ':is(:where(.group\\/questionnaire-choice):has([data-slot="questionnaire-choice-description"]) *)':
    {
      "--ui-translate-y": "calc(var(--spacing) * 0.5)",
      translate: "var(--ui-translate-x) var(--ui-translate-y)",
    },
  ':is(:where(.group\\/questionnaire-choice)[data-type="radio"] *)': {
    borderRadius: "calc(infinity * 1px)",
  },
  ":is(:where(.group\\/questionnaire-choice)[data-checked] *)": {
    borderColor: "var(--primary)",
    backgroundColor: "var(--primary)",
    color: "var(--primary-foreground)",
  },
  ":is(.dark *)": {
    backgroundColor: "var(--input)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--input) 30%, transparent)",
    },
  },
  ":is(.dark *):is(:where(.group\\/questionnaire-choice)[data-checked] *)": {
    backgroundColor: "var(--primary)",
  },
});

const indicatorDot = ui({
  display: "none",
  width: "calc(var(--spacing) * 2)",
  height: "calc(var(--spacing) * 2)",
  borderRadius: "calc(infinity * 1px)",
  backgroundColor: "var(--primary-foreground)",
  ":is(:where(.group\\/questionnaire-choice)[data-checked] *)": {
    display: "block",
  },
  ':is(:where(.group\\/questionnaire-choice)[data-type="checkbox"] *)': {
    display: "none",
  },
});

const indicatorCheck = ui({
  display: "none",
  width: "calc(var(--spacing) * 3.5)",
  height: "calc(var(--spacing) * 3.5)",
  ":is(:where(.group\\/questionnaire-choice)[data-checked] *)": {
    display: "block",
  },
  ':is(:where(.group\\/questionnaire-choice)[data-type="radio"] *)': {
    display: "none",
  },
});

const choiceLabel = ui({
  display: "flex",
  minWidth: "0px",
  flex: "1",
  flexDirection: "column",
  gap: "var(--spacing)",
  "--ui-leading": "var(--leading-snug)",
  lineHeight: "var(--leading-snug)",
});

const choiceShortcut = ui({
  pointerEvents: "none",
  marginInlineStart: "auto",
  display: "none",
  width: "calc(var(--spacing) * 5)",
  height: "calc(var(--spacing) * 5)",
  flexShrink: "0",
  "--ui-translate-y": "calc(var(--spacing) * 0.45)",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "calc(var(--radius) * 0.8)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  borderColor: "var(--input)",
  backgroundColor: "var(--background)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.625rem",
  "--ui-leading": "1",
  lineHeight: "1",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  color: "var(--muted-foreground)",
  "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  ':is(:where(.group\\/questionnaire-choice):has([data-slot="questionnaire-choice-description"]) *)':
    {
      "--ui-translate-y": "calc(var(--spacing) * 0.5)",
      translate: "var(--ui-translate-x) var(--ui-translate-y)",
    },
  ":is(:where(.group\\/questionnaire-choice)[data-shortcut] *)": {
    display: "inline-flex",
  },
});

const choiceDescription = ui({
  color: "var(--muted-foreground)",
});

const inputWrapper = ui({
  position: "relative",
  width: "100%",
  minWidth: "0px",
});

const input = ui({
  height: "calc(var(--spacing) * 9)",
  minHeight: "calc(var(--spacing) * 11)",
  width: "100%",
  minWidth: "0px",
  borderRadius: "calc(var(--radius) * 0.8)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  borderColor: "var(--input)",
  backgroundColor: "transparent",
  paddingInline: "calc(var(--spacing) * 2.5)",
  paddingBlock: "var(--spacing)",
  fontSize: "var(--text-base)",
  lineHeight: "var(--ui-leading, var(--text-base--line-height))",
  "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  transitionProperty: "color,box-shadow,background-color",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  "::selection": {
    backgroundColor: firstThatWorks("var(--primary)", "var(--primary)"),
    color: firstThatWorks("var(--primary-foreground)", "var(--primary-foreground)"),
  },
  "::placeholder": {
    color: "var(--muted-foreground)",
  },
  ":focus-visible": {
    borderColor: "var(--ring)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "var(--ring)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
    },
  },
  ":disabled": {
    pointerEvents: "none",
    cursor: "not-allowed",
    opacity: "50%",
  },
  '[aria-invalid="true"]': {
    borderColor: "var(--destructive)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "var(--destructive)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--destructive) 20%, transparent)",
    },
  },
  "@media (width >= 40rem)": {
    "&": {
      minHeight: "0px",
    },
  },
  "@media (width >= 48rem)": {
    "&": {
      fontSize: "var(--text-sm)",
      lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
    },
  },
  ":is(.dark *)": {
    backgroundColor: "var(--input)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--input) 30%, transparent)",
    },
  },
  ':is(.dark *)[aria-invalid="true"]': {
    borderColor: "var(--destructive)",
    "--ui-ring-color": "var(--destructive)",
    "@supports (color: color-mix(in lab, red, red))": {
      borderColor: "color-mix(in oklab, var(--destructive) 50%, transparent)",
      "--ui-ring-color": "color-mix(in oklab, var(--destructive) 40%, transparent)",
    },
  },
});

const error = ui({
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  color: "var(--destructive)",
});

const actions = ui({
  display: "grid",
  minHeight: "calc(var(--spacing) * 11)",
  width: "100%",
  gridTemplateColumns: "minmax(0,1fr) auto auto",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  "@media (width >= 40rem)": {
    "&": {
      minHeight: "calc(var(--spacing) * 9)",
    },
  },
});

const navigation = ui({
  gridRowStart: "1",
  minHeight: "calc(var(--spacing) * 11)",
  // The button's own `display` would draw one the questionnaire has hidden.
  "[hidden]": {
    display: "none",
  },
  "@media (width >= 40rem)": {
    "&": {
      minHeight: "0px",
    },
  },
});

const previous = ui(navigation, { gridColumnStart: "1", justifySelf: "flex-start" });
const skip = ui(navigation, { gridColumnStart: "2", justifySelf: "flex-end" });
const next = ui(navigation, { gridColumnStart: "3", justifySelf: "flex-end" });

export type QuestionnaireProps = AriaQuestionnaireProps;

/**
 * Several questions asked one at a time, answered as one native form.
 *
 * ```tsx
 * <Questionnaire onSubmit={(event) => send(new FormData(event.currentTarget))}>
 *   <QuestionnaireProgress />
 *   <QuestionnaireItem name="plan" required>
 *     <QuestionnaireTitle>Choose a plan</QuestionnaireTitle>
 *     <QuestionnaireChoices>
 *       <QuestionnaireChoice value="plus">Plus</QuestionnaireChoice>
 *       <QuestionnaireChoice value="pro">Pro</QuestionnaireChoice>
 *     </QuestionnaireChoices>
 *     <QuestionnaireError />
 *   </QuestionnaireItem>
 *   <QuestionnaireActions>
 *     <QuestionnairePrevious />
 *     <QuestionnaireSkip />
 *     <QuestionnaireNext />
 *     <QuestionnaireSubmit />
 *   </QuestionnaireActions>
 * </Questionnaire>
 * ```
 *
 * The behaviour is `@barqjs/aria/questionnaire`: which question is showing,
 * what counts as answered, the keys, and the focus that follows a move.
 */
export function Questionnaire(props: Incoming<QuestionnaireProps>) {
  return (
    <AriaQuestionnaire
      {...props}
      data-slot={props["data-slot"]?.() ?? "questionnaire"}
      class={ui(root, props.class?.(), props.className?.())}
    />
  );
}

export type QuestionnaireProgressProps = AriaQuestionnaireProgressProps;

export function QuestionnaireProgress(props: Incoming<QuestionnaireProgressProps>) {
  return (
    <AriaQuestionnaireProgress
      {...props}
      data-slot={props["data-slot"]?.() ?? "questionnaire-progress"}
      class={ui(progress, props.class?.(), props.className?.())}
    />
  );
}

export type QuestionnaireItemProps = AriaQuestionnaireItemProps;

export function QuestionnaireItem(props: Incoming<QuestionnaireItemProps>) {
  return (
    <AriaQuestionnaireItem
      {...props}
      data-slot={props["data-slot"]?.() ?? "questionnaire-item"}
      class={ui(item, props.class?.(), props.className?.())}
    />
  );
}

export type QuestionnaireTitleProps = QuestionnairePartProps;

export function QuestionnaireTitle(props: Incoming<QuestionnaireTitleProps>) {
  return (
    <AriaQuestionnaireTitle
      {...props}
      data-slot={props["data-slot"]?.() ?? "questionnaire-title"}
      class={ui(title, props.class?.(), props.className?.())}
    />
  );
}

export type QuestionnaireDescriptionProps = QuestionnairePartProps;

export function QuestionnaireDescription(props: Incoming<QuestionnaireDescriptionProps>) {
  return (
    <AriaQuestionnaireDescription
      {...props}
      data-slot={props["data-slot"]?.() ?? "questionnaire-description"}
      class={ui(description, props.class?.(), props.className?.())}
    />
  );
}

export type QuestionnaireChoicesProps = AriaQuestionnaireChoicesProps;

export function QuestionnaireChoices(props: Incoming<QuestionnaireChoicesProps>) {
  return (
    <AriaQuestionnaireChoices
      {...props}
      data-slot={props["data-slot"]?.() ?? "questionnaire-choices"}
      class={ui(choices, "group/questionnaire-choices", props.class?.(), props.className?.())}
    />
  );
}

export type QuestionnaireChoiceProps = AriaQuestionnaireChoiceProps;

/**
 * One fixed answer, with its mark and its shortcut drawn for it.
 *
 * The children are the label. The radio or checkbox is laid over the whole row
 * at zero opacity, so the row is the target and the real control is what takes
 * focus, is read out and is submitted.
 */
export function QuestionnaireChoice(props: Incoming<QuestionnaireChoiceProps>) {
  return (
    <AriaQuestionnaireChoice
      {...props}
      data-slot={props["data-slot"]?.() ?? "questionnaire-choice"}
      class={ui(choice, "group/questionnaire-choice", props.class?.(), props.className?.())}
    >
      <AriaQuestionnaireChoiceInput data-slot="questionnaire-choice-input" class={choiceInput} />
      <span aria-hidden="true" data-slot="questionnaire-choice-indicator" class={indicator}>
        <span data-slot="questionnaire-choice-indicator-dot" class={indicatorDot} />
        <Check data-slot="questionnaire-choice-indicator-check" class={indicatorCheck} />
      </span>
      <AriaQuestionnaireChoiceLabel data-slot="questionnaire-choice-label" class={choiceLabel}>
        {props.children}
      </AriaQuestionnaireChoiceLabel>
      <AriaQuestionnaireChoiceShortcut
        data-slot="questionnaire-choice-shortcut"
        class={choiceShortcut}
      />
    </AriaQuestionnaireChoice>
  );
}

/** A second, quieter line inside a choice. */
export function QuestionnaireChoiceDescription(props: Incoming<UiProps>) {
  return (
    <span {...uiProps("questionnaire-choice-description", choiceDescription, props)}>
      {props.children}
    </span>
  );
}

export type QuestionnaireInputProps = AriaQuestionnaireInputProps;

export function QuestionnaireInput(props: Incoming<QuestionnaireInputProps>) {
  return (
    <div
      data-slot="questionnaire-input-wrapper"
      class={ui(inputWrapper, "group/questionnaire-input")}
    >
      <AriaQuestionnaireInput
        {...props}
        data-slot={props["data-slot"]?.() ?? "questionnaire-input"}
        class={ui(input, props.class?.(), props.className?.())}
      />
    </div>
  );
}

export type QuestionnaireErrorProps = AriaQuestionnaireErrorProps;

export function QuestionnaireError(props: Incoming<QuestionnaireErrorProps>) {
  return (
    <AriaQuestionnaireError
      {...props}
      data-slot={props["data-slot"]?.() ?? "questionnaire-error"}
      class={ui(error, props.class?.(), props.className?.())}
    />
  );
}

/** The row the four navigation buttons sit in. */
export function QuestionnaireActions(props: Incoming<UiProps>) {
  return <div {...uiProps("questionnaire-actions", actions, props)}>{props.children}</div>;
}

export interface QuestionnaireNavigationProps extends QuestionnaireButtonProps {
  /** @default "default" */
  size?: ButtonSize;
  /** @default "outline" for previous and skip, "default" for next and submit */
  variant?: ButtonVariant;
}

export function QuestionnairePrevious(props: Incoming<QuestionnaireNavigationProps>) {
  const size = (): ButtonSize => props.size?.() ?? "default";
  const variant = (): ButtonVariant => props.variant?.() ?? "outline";
  return (
    <AriaQuestionnairePrevious
      {...props}
      data-slot={props["data-slot"]?.() ?? "questionnaire-previous"}
      data-size={size()}
      data-variant={variant()}
      class={ui(
        buttonVariants({ size: size(), variant: variant() }),
        previous,
        props.class?.(),
        props.className?.(),
      )}
    />
  );
}

export function QuestionnaireSkip(props: Incoming<QuestionnaireNavigationProps>) {
  const size = (): ButtonSize => props.size?.() ?? "default";
  const variant = (): ButtonVariant => props.variant?.() ?? "outline";
  return (
    <AriaQuestionnaireSkip
      {...props}
      data-slot={props["data-slot"]?.() ?? "questionnaire-skip"}
      data-size={size()}
      data-variant={variant()}
      class={ui(
        buttonVariants({ size: size(), variant: variant() }),
        skip,
        props.class?.(),
        props.className?.(),
      )}
    />
  );
}

export function QuestionnaireNext(props: Incoming<QuestionnaireNavigationProps>) {
  const size = (): ButtonSize => props.size?.() ?? "default";
  const variant = (): ButtonVariant => props.variant?.() ?? "default";
  return (
    <AriaQuestionnaireNext
      {...props}
      data-slot={props["data-slot"]?.() ?? "questionnaire-next"}
      data-size={size()}
      data-variant={variant()}
      class={ui(
        buttonVariants({ size: size(), variant: variant() }),
        next,
        props.class?.(),
        props.className?.(),
      )}
    />
  );
}

export function QuestionnaireSubmit(props: Incoming<QuestionnaireNavigationProps>) {
  const size = (): ButtonSize => props.size?.() ?? "default";
  const variant = (): ButtonVariant => props.variant?.() ?? "default";
  return (
    <AriaQuestionnaireSubmit
      {...props}
      data-slot={props["data-slot"]?.() ?? "questionnaire-submit"}
      data-size={size()}
      data-variant={variant()}
      class={ui(
        buttonVariants({ size: size(), variant: variant() }),
        next,
        props.class?.(),
        props.className?.(),
      )}
    />
  );
}
