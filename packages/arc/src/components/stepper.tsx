import { Show, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { Key } from "@barqjs/aria/collections";
import { focusRing } from "@barqjs/aria/focus";
import { numberFormatter } from "@barqjs/aria/i18n";
import { StepList, stepListItem, useStepList } from "@barqjs/aria/step-list";
import { mergeProps } from "@barqjs/aria/utils";
import { Check } from "@barqjs/lucide/icons/check";
import { CircleAlert } from "@barqjs/lucide/icons/circle-alert";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { on } from "@barqjs/ui/conditions";
import { contrast } from "@barqjs/ui/shared-contrast";
import { srOnly } from "@barqjs/ui/sr-only";
import { tokens } from "@barqjs/ui/theme/tokens";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  edge,
  fg,
  focus,
  gap,
  glyph,
  layout,
  motion,
  plainList,
  rounded,
  space,
  square,
  target,
  tone as tones,
  type,
} from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

export interface StepItem {
  id: string;
  label: string;
  /** A line under the label. Hidden on a narrow stepper. */
  description?: string;
  /** Marked as optional, in words. */
  optional?: boolean;
  /** Something in the step needs fixing: drawn in the danger tone and said so. */
  invalid?: boolean;
  isDisabled?: boolean;
}

/** A done step's marker: the primary fill with its foreground on it. */
const filled = {
  borderColor: tokens.primary,
  backgroundColor: tokens.primary,
  color: tokens.primaryForeground,
};

export const stepperStyles = variants({
  slots: {
    root: arc(layout.container, layout.minZero),
    list: arc(plainList, layout.row, { alignItems: "flex-start" }),
    step: arc(layout.row, layout.minZero, gap[2], { flex: "1 1 0", alignItems: "flex-start" }),
    link: arc(
      layout.row,
      layout.minZero,
      gap[2],
      rounded.md,
      focus.slot,
      motion.colours,
      target.size,
      {
        alignItems: "flex-start",
        textDecorationLine: "none",
        color: "inherit",
        "[data-selectable]": { cursor: "pointer" },
        "[aria-disabled]": { cursor: "default" },
      },
    ),
    marker: arc(
      layout.inlineCentre,
      layout.noShrink,
      rounded.full,
      type.label,
      type.numeric,
      glyph.sm,
      motion.colours,
      contrast.edge,
      square.x8,
      edge.all,
      { borderWidth: "2px", color: tokens.mutedForeground },
    ),
    text: arc(layout.column, layout.minZero, gap[0.5], { paddingBlockStart: space.x1_5 }),
    label: arc(type.label, fg.muted),
    description: arc(type.meta),
    optional: arc(type.meta, { fontStyle: "italic" }),
    connector: arc(layout.grow, rounded.full, {
      minWidth: space.x4,
      height: "2px",
      marginBlockStart: "calc(var(--spacing) * 4 - 1px)",
      backgroundColor: tokens.border,
      "li:last-child > &": { display: "none" },
    }),
    hint: arc(srOnly),
  },
  variants: {
    orientation: {
      horizontal: {
        root: arc({
          [on.cqBelowMd]: {
            "& [data-step-description]": { display: "none" },
            '& li:not([data-state="current"]) [data-step-text]': { display: "none" },
          },
        }),
      },
      vertical: {
        list: arc({ flexDirection: "column", alignItems: "stretch" }),
        step: arc(layout.column, gap[0], { flex: "0 0 auto" }),
        connector: arc({
          flex: "0 0 auto",
          width: "2px",
          minWidth: "2px",
          minHeight: space.x6,
          height: "auto",
          marginBlock: space.x1,
          marginInlineStart: "calc(var(--spacing) * 4 - 1px)",
        }),
      },
    },
    state: {
      upcoming: {},
      current: {
        marker: arc({ borderColor: tokens.primary, color: tokens.primary }),
        label: fg.default,
      },
      completed: {
        marker: arc(filled),
        label: fg.default,
        connector: arc({ backgroundColor: tokens.primary }),
      },
      invalid: {
        step: tones.danger,
        marker: arc(bg.tone, fg.tone, edge.tone),
        label: fg.tone,
      },
    },
  },
  defaults: { orientation: "horizontal", state: "upcoming" },
});

type Slots = ReturnType<typeof stepperStyles>;

export interface StepperProps extends Customisable<Slots> {
  items: readonly StepItem[];
  /** @default aria's "Step list", in the page's language */
  "aria-label"?: string;
  selectedKey?: string;
  defaultSelectedKey?: string;
  onSelectionChange?: (id: string) => void;
  /**
   * The last step done. Every step up to it and the one after it can be
   * reached; the rest wait.
   */
  lastCompletedStep?: string | null;
  defaultLastCompletedStep?: string | null;
  onLastCompletedStepChange?: (id: string | null) => void;
  /** @default "horizontal" */
  orientation?: "horizontal" | "vertical";
  /** The steps are shown, not offered. */
  isReadOnly?: boolean;
  isDisabled?: boolean;
  id?: string;
}

/**
 * Where a reader is in a task of several steps, and the way back to the ones
 * done: a wizard's, a checkout's, an import's.
 *
 * ```tsx
 * <Stepper
 *   aria-label="Import"
 *   items={[
 *     { id: "upload", label: "Upload" },
 *     { id: "map", label: "Map columns", description: "Match each column" },
 *     { id: "review", label: "Review", optional: true },
 *   ]}
 *   selectedKey={step()}
 *   onSelectionChange={setStep}
 *   lastCompletedStep={done()}
 * />
 * ```
 *
 * On `@barqjs/aria`'s step list: each step is a link with its state in words
 * ("Completed", "Current"), reachable once the step before it is done, and
 * the arrows move between the ones that are. A done step shows a check, an
 * `invalid` one an alert in the danger tone and says it has errors. Across a
 * narrow container a horizontal stepper keeps the markers and the current
 * step's label, and drops the descriptions.
 */
export function Stepper(props: StepperProps) {
  function cls(): Slots {
    return parts(stepperStyles({ orientation: props.orientation }), props.classes);
  }
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="stepper"
      data-orientation={props.orientation ?? "horizontal"}
    >
      <StepList<StepItem>
        class={cls().list}
        data-slot="stepper-list"
        items={props.items}
        getKey={(item: StepItem) => item.id}
        getTextValue={(item: StepItem) => item.label}
        disabledKeys={props.items.filter((one) => one.isDisabled === true).map((one) => one.id)}
        aria-label={props["aria-label"]}
        orientation={props.orientation ?? "horizontal"}
        selectedKey={props.selectedKey}
        defaultSelectedKey={props.defaultSelectedKey}
        onSelectionChange={(key: Key) => props.onSelectionChange?.(String(key))}
        lastCompletedStep={props.lastCompletedStep}
        defaultLastCompletedStep={props.defaultLastCompletedStep}
        onLastCompletedStepChange={(key: Key | null) =>
          props.onLastCompletedStepChange?.(key === null ? null : String(key))
        }
        isReadOnly={props.isReadOnly}
        isDisabled={props.isDisabled}
      >
        {(item: StepItem) => (
          <Step
            item={item}
            index={props.items.findIndex((one) => one.id === item.id)}
            orientation={props.orientation ?? "horizontal"}
            classes={props.classes}
          />
        )}
      </StepList>
    </div>
  );
}

type StepState = "upcoming" | "current" | "completed" | "invalid";

interface StepProps {
  item: StepItem;
  index: number;
  orientation: "horizontal" | "vertical";
  classes: StepperProps["classes"];
}

function Step(props: StepProps) {
  const state = useStepList();
  if (state === null) throw new Error("A step must be rendered inside its Stepper.");
  const messages = useArcMessages();
  const number = numberFormatter();
  const link = makeRef<HTMLAnchorElement>();
  const step = stepListItem({ key: props.item.id, ref: link }, state);
  const { focusProps, isFocusVisible } = focusRing();
  const markerId = createUniqueId();
  const stateId = createUniqueId();
  const labelId = createUniqueId();
  const hintId = createUniqueId();
  const item = props.item;
  function stateOf(): StepState {
    if (item.invalid === true) return "invalid";
    if (step.isSelected()) return "current";
    return step.isCompleted() ? "completed" : "upcoming";
  }
  function cls(): Slots {
    return parts(
      stepperStyles({ orientation: props.orientation, state: stateOf() }),
      props.classes,
    );
  }
  function notes(): string {
    return [
      item.invalid === true ? messages().hasErrors : "",
      item.optional === true ? messages().optional : "",
    ]
      .filter((one) => one !== "")
      .join(", ");
  }
  const linkProps = mergeProps(step.stepProps, focusProps, {
    "aria-labelledby": `${markerId} ${stateId} ${labelId}`,
    "aria-describedby": () => (notes() === "" ? undefined : hintId),
    "data-selectable": () => (step.isSelectable() && !step.isSelected() ? "" : undefined),
    "data-focus-visible": () => (isFocusVisible() ? "" : undefined),
  });
  return (
    <li class={cls().step} data-slot="stepper-step" data-state={stateOf()}>
      <a {...linkProps} ref={link.set} class={cls().link} data-slot="stepper-link">
        <span id={markerId} class={cls().hint} data-slot="stepper-number">
          {number().format(props.index + 1)}
        </span>
        <span id={stateId} class={cls().hint} data-slot="stepper-state">
          {step.stepStateText()}
        </span>
        <span class={cls().marker} data-slot="stepper-marker" aria-hidden="true">
          {stateOf() === "invalid" ? (
            <CircleAlert />
          ) : stateOf() === "completed" ? (
            <Check />
          ) : (
            number().format(props.index + 1)
          )}
        </span>
        <span class={cls().text} data-slot="stepper-text" data-step-text="">
          <span id={labelId} class={cls().label} data-slot="stepper-label">
            {item.label}
          </span>
          <Show when={item.description !== undefined}>
            <span
              class={cls().description}
              data-slot="stepper-description"
              data-step-description=""
              aria-hidden="true"
            >
              {item.description}
            </span>
          </Show>
          <Show when={item.optional === true}>
            <span class={cls().optional} data-slot="stepper-optional" aria-hidden="true">
              {messages().optional}
            </span>
          </Show>
        </span>
        <Show when={notes() !== ""}>
          <span id={hintId} class={cls().hint} data-slot="stepper-hint">
            {notes()}
          </span>
        </Show>
      </a>
      <span class={cls().connector} data-slot="stepper-connector" aria-hidden="true" />
    </li>
  );
}
