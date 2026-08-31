import type { Incoming } from "@barqjs/core";

import { mergeRefs, type RefTarget } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { ui } from "../lib/atoms.ts";
import type { UiProps } from "../lib/props.ts";
import { controlProps } from "../lib/slot.ts";

const control = ui({
  height: "calc(var(--spacing) * 9)",
  width: "100%",
  borderRadius: "calc(var(--radius) - 2px)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  borderColor: "var(--input)",
  backgroundColor: "transparent",
  paddingInline: "calc(var(--spacing) * 3)",
  paddingBlock: "var(--spacing)",
  fontSize: "var(--text-base)",
  lineHeight: "var(--ui-leading, var(--text-base--line-height))",
  "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  transitionProperty: "color, box-shadow",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "--ui-outline-style": "none",
  outlineStyle: "none",
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
    cursor: "not-allowed",
    opacity: "50%",
  },
  '[aria-invalid="true"]': {
    borderColor: "var(--destructive)",
    "--ui-ring-color": "var(--destructive)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--destructive) 20%, transparent)",
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
});

/**
 * The platform's own `<select>`, styled.
 *
 * There is a `<Select>` in this package that builds a listbox in a popover, and
 * on a phone the native one is still better: it opens the operating system's
 * picker, it scrolls with a thumb the user already knows, and it costs no
 * JavaScript at all.
 */
const chevron = ui({
  appearance: "none",
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right calc(var(--spacing) * 2) center",
  backgroundSize: "calc(var(--spacing) * 4)",
  paddingRight: "calc(var(--spacing) * 8)",
});

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
      {...controlProps("native-select", () => ui(control, chevron), props)}
      ref={mergeRefs(props.ref?.())}
    >
      {props.children}
    </select>
  );
}
