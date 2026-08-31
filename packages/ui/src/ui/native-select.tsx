import type { Incoming } from "@barqjs/core";
import { clsx, css } from "@barqjs/css";
import { mergeRefs, type RefTarget } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { controlProps } from "../lib/slot.ts";

const control = css`
  @layer barq.ui {
    height: calc(var(--spacing) * 9);
    width: 100%;
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
  }
`;

/**
 * The platform's own `<select>`, styled.
 *
 * There is a `<Select>` in this package that builds a listbox in a popover, and
 * on a phone the native one is still better: it opens the operating system's
 * picker, it scrolls with a thumb the user already knows, and it costs no
 * JavaScript at all.
 */
const chevron = css`
  @layer barq.ui {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right calc(var(--spacing) * 2) center;
    background-size: calc(var(--spacing) * 4);
    padding-right: calc(var(--spacing) * 8);
  }
`;

export interface NativeSelectProps extends UiProps {
  name?: string;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  required?: boolean;
  multiple?: boolean;
  size?: number;
  form?: string;
  autoComplete?: string;
  "aria-invalid"?: boolean | "true" | "false";
  ref?: RefTarget<HTMLSelectElement>;
  onChange?: (event: Event) => void;
  onInput?: (event: Event) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
}

export function NativeSelect(props: Incoming<NativeSelectProps>) {
  return (
    <select
      {...controlProps("native-select", () => clsx(control, chevron), props)}
      ref={mergeRefs(props.ref?.())}
    >
      {props.children}
    </select>
  );
}
