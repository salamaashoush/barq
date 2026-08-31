import type { Incoming } from "@barqjs/core";
import { firstThatWorks, layer } from "@barqjs/css";
import { mergeRefs, type RefTarget } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { shared } from "../lib/shared.ts";
import type { UiProps } from "../lib/props.ts";
import { controlProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

const input = ui(
  shared.border,
  shared.shadow,
  shared.transition,
  shared.outlineNone,
  shared.focusRing,
  shared.invalidRing,
  shared.darkInput,
  shared.invalidRingDark,
  {
    height: "calc(var(--spacing) * 9)",
    width: "100%",
    minWidth: "0px",
    borderRadius: "calc(var(--radius) - 2px)",
    borderColor: "var(--input)",
    backgroundColor: "transparent",
    paddingInline: "calc(var(--spacing) * 3)",
    paddingBlock: "var(--spacing)",
    fontSize: "var(--text-base)",
    lineHeight: "var(--ui-leading, var(--text-base--line-height))",
    "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
    transitionProperty: "color, box-shadow",
    "::selection": {
      backgroundColor: firstThatWorks("var(--primary)", "var(--primary)"),
      color: firstThatWorks("var(--primary-foreground)", "var(--primary-foreground)"),
    },
    "::file-selector-button": {
      display: "inline-flex",
      height: "calc(var(--spacing) * 7)",
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
      opacity: "50%",
    },
    "@media (width >= 48rem)": {
      "&": {
        fontSize: "var(--text-sm)",
        lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
      },
    },
  },
);

const textarea = ui(
  shared.border,
  shared.shadow,
  shared.transition,
  shared.outlineNone,
  shared.focusRing,
  shared.invalidRing,
  shared.darkInput,
  shared.invalidRingDark,
  {
    display: "flex",
    fieldSizing: "content",
    minHeight: "calc(var(--spacing) * 16)",
    width: "100%",
    borderRadius: "calc(var(--radius) - 2px)",
    borderColor: "var(--input)",
    backgroundColor: "transparent",
    paddingInline: "calc(var(--spacing) * 3)",
    paddingBlock: "calc(var(--spacing) * 2)",
    fontSize: "var(--text-base)",
    lineHeight: "var(--ui-leading, var(--text-base--line-height))",
    "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
    transitionProperty: "color, box-shadow",
    "::placeholder": {
      color: "var(--muted-foreground)",
    },
    ":disabled": {
      cursor: "not-allowed",
      opacity: "50%",
    },
    "@media (width >= 48rem)": {
      "&": {
        fontSize: "var(--text-sm)",
        lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
      },
    },
  },
);

export interface InputProps extends UiProps {
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
  return <input {...controlProps("input", input, props)} ref={mergeRefs(props.ref?.())} />;
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
