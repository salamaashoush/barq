import { Checkbox as AriaCheckbox, type CheckboxComponentProps } from "@barqjs/aria/checkbox";
import { Show, type Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import { Check } from "@barqjs/lucide/icons/check";
import { Minus } from "@barqjs/lucide/icons/minus";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { ringSlot } from "../lib/shared-ring-slot.ts";
import { when } from "../lib/shared-when.ts";

const ui = layer("barq.ui");

const control = ui(
  box.border,
  box.transition,
  box.outline,
  when.darkInput,
  ringSlot.focus,
  when.disabledCursor,
  ringSlot.invalid,
  ringSlot.invalidRing,
  ringSlot.invalidDark,
  ringSlot.invalidBorderDark,
  // A label beside it reads `.peer:disabled ~ *`.
  "peer",
  {
    position: "relative",
    display: "flex",
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
    flexShrink: "0",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "4px",
    borderColor: "var(--input)",
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --ui-gradient-from, --ui-gradient-via, --ui-gradient-to",
    // 16px is under the pointer-target minimum, so the press area is grown
    // past the paint. Same trick as the switch.
    "::after": {
      content: "var(--ui-content)",
      position: "absolute",
      insetInline: "calc(var(--spacing) * -3)",
      insetBlock: "calc(var(--spacing) * -2)",
    },
    // Inside a field the ROW carries the ring and the box carries none, or
    // there are two rings around one control.
    ":is(:where(.group\\/field):has(:disabled) *)": {
      opacity: "50%",
    },
    ":is(:where(.group\\/field-label):has(:is(:focus-visible)) *)": {
      "--ui-ring-shadow":
        "var(--ui-ring-inset,) 0 0 0 calc(0px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    },
    ":is(:where(.group\\/field-label):has(:is(:focus-visible)) *):not([data-selected])": {
      borderColor: "var(--input)",
    },
    ":is(:where(.group\\/field-label):has(:is(:focus-visible)) *)[data-selected]": {
      borderColor: "var(--primary)",
    },
    // An invalid box that is nonetheless ticked keeps the primary border: the
    // tick is not the thing that is wrong.
    '[data-invalid][aria-checked="true"]': {
      borderColor: "var(--primary)",
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
      class={ui(control, props.class?.(), props.className?.())}
    >
      <span data-slot="checkbox-indicator" class={indicator}>
        <Show when={props.isIndeterminate?.() === true} fallback={<Check />}>
          <Minus />
        </Show>
      </span>
    </AriaCheckbox>
  );
}
