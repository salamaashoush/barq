import { Checkbox as AriaCheckbox, type CheckboxComponentProps } from "@barqjs/aria/checkbox";
import { Show, type Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import { Check } from "@barqjs/lucide/icons/check";
import { Minus } from "@barqjs/lucide/icons/minus";

import "../theme/layers.ts";
import { shared } from "../lib/shared.ts";

const ui = layer("barq.ui");

const box = ui(
  shared.border,
  shared.shadow,
  shared.transition,
  shared.outlineNone,
  shared.darkInput,
  shared.focusRingData,
  shared.disabledCursor,
  shared.invalidRingSlot,
  shared.invalidRingSlotDark,
  {
    display: "inline-grid",
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
    flexShrink: "0",
    placeContent: "center",
    borderRadius: "4px",
    borderColor: "var(--input)",
    "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
    transitionProperty: "box-shadow",
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
  },
);

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
