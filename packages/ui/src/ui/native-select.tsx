import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import { mergeRefs, type RefTarget } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { ring } from "../lib/shared-ring.ts";
import { when } from "../lib/shared-when.ts";
import type { UiProps } from "../lib/props.ts";
import { controlProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

const control = ui(
  box.border,
  box.shadow,
  box.transition,
  box.outline,
  ring.focus,
  ring.invalid,
  when.darkInput,
  {
    height: "calc(var(--spacing) * 9)",
    width: "100%",
    borderRadius: "calc(var(--radius) - 2px)",
    borderColor: "var(--input)",
    backgroundColor: "transparent",
    paddingInline: "calc(var(--spacing) * 3)",
    paddingBlock: "var(--spacing)",
    fontSize: "var(--text-base)",
    lineHeight: "var(--ui-leading, var(--text-base--line-height))",
    "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
    transitionProperty: "color, box-shadow",
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
