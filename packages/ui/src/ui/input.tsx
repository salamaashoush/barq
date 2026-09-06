import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";
import { mergeRefs, type RefTarget } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { ring } from "../lib/shared-ring.ts";
import { when } from "../lib/shared-when.ts";
import type { UiProps } from "../lib/props.ts";
import { controlProps, omit } from "../lib/slot.ts";

const ui = layer("barq.ui");

const input = ui(
  box.border,
  box.transition,
  box.outline,
  ring.focus,
  ring.invalid,
  ring.invalidRing,
  when.darkInput,
  ring.invalidDark,
  ring.invalidBorderDark,
  {
    height: "calc(var(--spacing) * 8)",
    width: "100%",
    minWidth: "0px",
    borderRadius: "var(--radius)",
    borderColor: "var(--input)",
    backgroundColor: "transparent",
    paddingInline: "calc(var(--spacing) * 2.5)",
    paddingBlock: "var(--spacing)",
    fontSize: "var(--text-base)",
    lineHeight: "var(--ui-leading, var(--text-base--line-height))",
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --ui-gradient-from, --ui-gradient-via, --ui-gradient-to",
    "::file-selector-button": {
      display: "inline-flex",
      height: "calc(var(--spacing) * 6)",
      borderStyle: "var(--ui-border-style)",
      borderWidth: "0px",
      backgroundColor: "transparent",
      fontSize: "var(--text-sm)",
      lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
      "--ui-font-weight": "var(--font-weight-medium)",
      fontWeight: "var(--font-weight-medium)",
      color: "var(--foreground)",
    },
    "::placeholder": {
      color: "var(--muted-foreground)",
    },
    ":disabled": {
      pointerEvents: "none",
      cursor: "not-allowed",
      backgroundColor: "var(--input)",
      opacity: "50%",
      "@supports (color: color-mix(in lab, red, red))": {
        backgroundColor: "color-mix(in oklab, var(--input) 50%, transparent)",
      },
    },
    // The dense one, matching `NativeSelect`'s: a panel of numbers beside a
    // panel of selects has to line up, and a field that is 32 px next to one
    // that is 28 px reads as a mistake.
    '[data-size="sm"]': {
      height: "calc(var(--spacing) * 7)",
      borderRadius: "min(var(--radius-md), 10px)",
      paddingInline: "calc(var(--spacing) * 2)",
      fontSize: "var(--text-sm)",
      lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
    },
    "@media (width >= 48rem)": {
      "&": {
        fontSize: "var(--text-sm)",
        lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
      },
    },
    ":is(.dark *):disabled": {
      backgroundColor: "var(--input)",
      "@supports (color: color-mix(in lab, red, red))": {
        backgroundColor: "color-mix(in oklab, var(--input) 80%, transparent)",
      },
    },
  },
);

const textarea = ui(
  box.border,
  box.transition,
  box.outline,
  ring.focus,
  ring.invalid,
  ring.invalidRing,
  when.darkInput,
  ring.invalidDark,
  ring.invalidBorderDark,
  {
    display: "flex",
    fieldSizing: "content",
    minHeight: "calc(var(--spacing) * 16)",
    width: "100%",
    borderRadius: "var(--radius)",
    borderColor: "var(--input)",
    backgroundColor: "transparent",
    paddingInline: "calc(var(--spacing) * 2.5)",
    paddingBlock: "calc(var(--spacing) * 2)",
    fontSize: "var(--text-base)",
    lineHeight: "var(--ui-leading, var(--text-base--line-height))",
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --ui-gradient-from, --ui-gradient-via, --ui-gradient-to",
    "::placeholder": {
      color: "var(--muted-foreground)",
    },
    ":disabled": {
      cursor: "not-allowed",
      backgroundColor: "var(--input)",
      opacity: "50%",
      "@supports (color: color-mix(in lab, red, red))": {
        backgroundColor: "color-mix(in oklab, var(--input) 50%, transparent)",
      },
    },
    "@media (width >= 48rem)": {
      "&": {
        fontSize: "var(--text-sm)",
        lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
      },
    },
    ":is(.dark *):disabled": {
      backgroundColor: "var(--input)",
      "@supports (color: color-mix(in lab, red, red))": {
        backgroundColor: "color-mix(in oklab, var(--input) 80%, transparent)",
      },
    },
  },
);

export type InputSize = "default" | "sm";

export interface InputProps extends UiProps {
  /** `sm` is the dense one, the height `NativeSelect`'s `sm` is. */
  size?: InputSize;
  type?: string;
  name?: string;
  value?: string | number;
  defaultValue?: string | number;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  inputMode?: string;
  form?: string;
  list?: string;
  accept?: string;
  multiple?: boolean;
  "aria-invalid"?: boolean | "true" | "false";
  ref?: RefTarget<HTMLInputElement>;
  onInput?: (event: Event) => void;
  onChange?: (event: Event) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
}

/**
 * A styled `<input>`, and nothing more.
 *
 * Deliberately not a field: no label, no description, no validation. That is
 * `<Field>`'s job, exactly as it is in shadcn — an input that owned its own
 * label could not be put inside a form row that owns one too.
 */
export function Input(props: Incoming<InputProps>) {
  return (
    <input
      {...controlProps("input", input, omit(props, ["size"]))}
      data-size={props.size?.() ?? "default"}
      ref={mergeRefs(props.ref?.())}
    />
  );
}

export interface TextareaProps extends Omit<InputProps, "type" | "ref"> {
  rows?: number;
  cols?: number;
  wrap?: "hard" | "soft" | "off";
  ref?: RefTarget<HTMLTextAreaElement>;
}

/**
 * `field-sizing: content`, so it grows with what is typed and needs no
 * resize observer and no shadow element to measure against.
 */
export function Textarea(props: Incoming<TextareaProps>) {
  return <textarea {...controlProps("textarea", textarea, props)} ref={mergeRefs(props.ref?.())} />;
}
