import { Checkbox as AriaCheckbox, type CheckboxComponentProps } from "@barqjs/aria/checkbox";
import { Show, type Incoming } from "@barqjs/core";

import { Check } from "@barqjs/lucide/icons/check";
import { Minus } from "@barqjs/lucide/icons/minus";

import "../theme/layers.ts";
import { ui } from "../lib/atoms.ts";

const box = ui({
  display: "inline-grid",
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
  flexShrink: "0",
  placeContent: "center",
  borderRadius: "4px",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  borderColor: "var(--input)",
  "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  transitionProperty: "box-shadow",
  transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
  transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  "--ui-outline-style": "none",
  outlineStyle: "none",
  ":is(.dark *)": {
    backgroundColor: "var(--input)",
    "@supports (color: color-mix(in lab, red, red))": {
      backgroundColor: "color-mix(in oklab, var(--input) 30%, transparent)",
    },
  },
  "[data-selected]": {
    borderColor: "var(--primary)",
    backgroundColor: "var(--primary)",
    color: "var(--primary-foreground)",
  },
  ":is(.dark *)[data-selected]": {
    backgroundColor: "var(--primary)",
  },
  "[data-indeterminate]": {
    borderColor: "var(--primary)",
    backgroundColor: "var(--primary)",
    color: "var(--primary-foreground)",
  },
  "[data-focus-visible]": {
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
  "[data-disabled]": {
    cursor: "not-allowed",
    opacity: "50%",
  },
  "[data-invalid]": {
    borderColor: "var(--destructive)",
    "--ui-ring-color": "var(--destructive)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--destructive) 20%, transparent)",
    },
  },
  ":is(.dark *)[data-invalid]": {
    "--ui-ring-color": "var(--destructive)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--destructive) 40%, transparent)",
    },
  },
});

const indicator = ui({
  display: "none",
  placeContent: "center",
  color: "currentcolor",
  transitionProperty: "none",
  "& > svg": {
    width: "calc(var(--spacing) * 3.5)",
    height: "calc(var(--spacing) * 3.5)",
  },
  "[data-indeterminate] &": {
    display: "grid",
  },
  "[data-selected] &": {
    display: "grid",
  },
});

export interface CheckboxProps extends CheckboxComponentProps {
  children?: never;
}

/**
 * ```tsx
 * <Checkbox id="terms" onChange={(on) => accepted.set(on)} />
 * <Label for="terms">Accept the terms</Label>
 * ```
 *
 * The box IS the `<label>`: it wraps a visually hidden `<input type="checkbox">`,
 * so clicking it toggles through the platform rather than through a handler, and
 * a `<Label for>` pointing at the same id is a second label for the same input.
 * shadcn renders a `<button role="checkbox">` and has to reimplement all of
 * that.
 */
export function Checkbox(props: Incoming<CheckboxProps>) {
  return (
    <AriaCheckbox
      {...props}
      data-slot={props["data-slot"]?.() ?? "checkbox"}
      class={ui(box, props.class?.(), props.className?.())}
    >
      <span data-slot="checkbox-indicator" class={indicator}>
        <Show when={props.isIndeterminate?.() === true} fallback={<Check />}>
          <Minus />
        </Show>
      </span>
    </AriaCheckbox>
  );
}
