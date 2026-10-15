import {
  Checkbox as AriaCheckbox,
  useCheckbox,
  type CheckboxComponentProps,
} from "@barqjs/aria/checkbox";
import { Show, type Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import { Check } from "@barqjs/lucide/icons/check";
import { Minus } from "@barqjs/lucide/icons/minus";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { ringSlot } from "../lib/shared-ring-slot.ts";
import { omit } from "../lib/slot.ts";
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
  /** shadcn's spelling of `isSelected`, with `"indeterminate"` for `isIndeterminate`. */
  checked?: boolean | "indeterminate";
  /** shadcn's spelling of `defaultSelected`. */
  defaultChecked?: boolean;
  /** shadcn's spelling of `onChange`. */
  onCheckedChange?: (checked: boolean) => void;
  /** shadcn's spelling of `isDisabled`. */
  disabled?: boolean;
  /** shadcn's spelling of `isRequired`. */
  required?: boolean;
}

const UPSTREAM = ["checked", "defaultChecked", "onCheckedChange", "disabled", "required"] as const;

/**
 * ```tsx
 * <Checkbox id="terms" onChange={(on) => accepted.set(on)} />
 * <Label for="terms">Accept the terms</Label>
 * ```
 *
 * The box is a `<span>` around a visually hidden `<input type="checkbox">`, so
 * the control is the platform's own: it is in the form's data, a `<Label for>`
 * pointing at its id toggles it, and so does a `<label>` or `<FieldLabel>`
 * wrapped around it. shadcn renders a `<button role="checkbox">` and has to
 * reimplement all of that.
 *
 * It is not a `<label>` itself: it holds a tick and no text, and a label may
 * not contain another, so it has to be able to sit inside the one naming it.
 *
 * ```tsx
 * <FieldLabel>
 *   <Field orientation="horizontal">
 *     <Checkbox />
 *     <FieldTitle>Accept the terms</FieldTitle>
 *   </Field>
 * </FieldLabel>
 * ```
 */
export function Checkbox(props: Incoming<CheckboxProps>) {
  return (
    <AriaCheckbox
      {...omit(props, UPSTREAM)}
      // Written around text it is the label it used to be; on its own it is
      // the bare control, for the `<Label>` or `<Field>` that names it.
      elementType={props.children === undefined ? "span" : "label"}
      data-slot={props["data-slot"]?.() ?? "checkbox"}
      class={ui(control, props.class?.(), props.className?.())}
      isSelected={
        props.isSelected?.() ?? (props.checked === undefined ? undefined : props.checked() === true)
      }
      isIndeterminate={props.isIndeterminate?.() ?? props.checked?.() === "indeterminate"}
      defaultSelected={props.defaultSelected?.() ?? props.defaultChecked?.()}
      isDisabled={props.isDisabled?.() ?? props.disabled?.()}
      isRequired={props.isRequired?.() ?? props.required?.()}
      onChange={(checked: boolean) => {
        props.onChange?.()?.(checked);
        props.onCheckedChange?.()?.(checked);
      }}
    >
      <CheckboxIndicator />
    </AriaCheckbox>
  );
}

function CheckboxIndicator() {
  const state = useCheckbox();
  return (
    <span
      data-slot="checkbox-indicator"
      class={indicator}
      data-state={() =>
        state.isIndeterminate() ? "indeterminate" : state.isSelected() ? "checked" : "unchecked"
      }
      data-disabled={() => (state.isDisabled() ? "" : undefined)}
    >
      <Show when={state.isIndeterminate()} fallback={<Check />}>
        <Minus />
      </Show>
    </span>
  );
}
