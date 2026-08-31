import type { Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import { mergeRefs, type RefTarget } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { controlProps } from "../lib/slot.ts";

const input = css`
  @layer barq.ui {
    height: calc(var(--spacing) * 9);
    width: 100%;
    min-width: 0px;
    border-radius: calc(var(--radius) - 2px);
    border-style: var(--ui-border-style);
    border-width: 1px;
    border-color: var(--input);
    background-color: transparent;
    padding-inline: calc(var(--spacing) * 3);
    padding-block: var(--spacing);
    font-size: var(--text-base);
    line-height: var(--ui-leading, var(--text-base--line-height));
    --ui-shadow: 0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05));
    box-shadow:
      var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
      var(--ui-ring-shadow), var(--ui-shadow);
    transition-property: color, box-shadow;
    transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
    transition-duration: var(--ui-duration, var(--default-transition-duration));
    --ui-outline-style: none;
    outline-style: none;
    & ::selection {
      background-color: var(--primary);
    }
    &::selection {
      background-color: var(--primary);
    }
    & ::selection {
      color: var(--primary-foreground);
    }
    &::selection {
      color: var(--primary-foreground);
    }
    &::file-selector-button {
      display: inline-flex;
      height: calc(var(--spacing) * 7);
      border-style: var(--ui-border-style);
      border-width: 0px;
      background-color: transparent;
      font-size: var(--text-sm);
      line-height: var(--ui-leading, var(--text-sm--line-height));
      --ui-font-weight: var(--font-weight-medium);
      font-weight: var(--font-weight-medium);
      color: var(--foreground);
    }
    &::placeholder {
      color: var(--muted-foreground);
    }
    &:focus-visible {
      border-color: var(--ring);
      --ui-ring-shadow: var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width))
        var(--ui-ring-color, currentcolor);
      box-shadow:
        var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
        var(--ui-ring-shadow), var(--ui-shadow);
      --ui-ring-color: var(--ring);
      @supports (color: color-mix(in lab, red, red)) {
        --ui-ring-color: color-mix(in oklab, var(--ring) 50%, transparent);
      }
    }
    &:disabled {
      pointer-events: none;
      cursor: not-allowed;
      opacity: 50%;
    }
    &[aria-invalid="true"] {
      border-color: var(--destructive);
      --ui-ring-color: var(--destructive);
      @supports (color: color-mix(in lab, red, red)) {
        --ui-ring-color: color-mix(in oklab, var(--destructive) 20%, transparent);
      }
    }
    @media (width >= 48rem) {
      & {
        font-size: var(--text-sm);
        line-height: var(--ui-leading, var(--text-sm--line-height));
      }
    }
    &:is(.dark *) {
      background-color: var(--input);
      @supports (color: color-mix(in lab, red, red)) {
        background-color: color-mix(in oklab, var(--input) 30%, transparent);
      }
    }
    &:is(.dark *)[aria-invalid="true"] {
      --ui-ring-color: var(--destructive);
      @supports (color: color-mix(in lab, red, red)) {
        --ui-ring-color: color-mix(in oklab, var(--destructive) 40%, transparent);
      }
    }
  }
`;

const textarea = css`
  @layer barq.ui {
    display: flex;
    field-sizing: content;
    min-height: calc(var(--spacing) * 16);
    width: 100%;
    border-radius: calc(var(--radius) - 2px);
    border-style: var(--ui-border-style);
    border-width: 1px;
    border-color: var(--input);
    background-color: transparent;
    padding-inline: calc(var(--spacing) * 3);
    padding-block: calc(var(--spacing) * 2);
    font-size: var(--text-base);
    line-height: var(--ui-leading, var(--text-base--line-height));
    --ui-shadow: 0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05));
    box-shadow:
      var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
      var(--ui-ring-shadow), var(--ui-shadow);
    transition-property: color, box-shadow;
    transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
    transition-duration: var(--ui-duration, var(--default-transition-duration));
    --ui-outline-style: none;
    outline-style: none;
    &::placeholder {
      color: var(--muted-foreground);
    }
    &:focus-visible {
      border-color: var(--ring);
      --ui-ring-shadow: var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width))
        var(--ui-ring-color, currentcolor);
      box-shadow:
        var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
        var(--ui-ring-shadow), var(--ui-shadow);
      --ui-ring-color: var(--ring);
      @supports (color: color-mix(in lab, red, red)) {
        --ui-ring-color: color-mix(in oklab, var(--ring) 50%, transparent);
      }
    }
    &:disabled {
      cursor: not-allowed;
      opacity: 50%;
    }
    &[aria-invalid="true"] {
      border-color: var(--destructive);
      --ui-ring-color: var(--destructive);
      @supports (color: color-mix(in lab, red, red)) {
        --ui-ring-color: color-mix(in oklab, var(--destructive) 20%, transparent);
      }
    }
    @media (width >= 48rem) {
      & {
        font-size: var(--text-sm);
        line-height: var(--ui-leading, var(--text-sm--line-height));
      }
    }
    &:is(.dark *) {
      background-color: var(--input);
      @supports (color: color-mix(in lab, red, red)) {
        background-color: color-mix(in oklab, var(--input) 30%, transparent);
      }
    }
    &:is(.dark *)[aria-invalid="true"] {
      --ui-ring-color: var(--destructive);
      @supports (color: color-mix(in lab, red, red)) {
        --ui-ring-color: color-mix(in oklab, var(--destructive) 40%, transparent);
      }
    }
  }
`;

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
