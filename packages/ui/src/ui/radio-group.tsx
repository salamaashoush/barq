import { provideDirection, useDirection } from "@barqjs/aria/i18n";
import {
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  useRadio,
  type RadioComponentProps,
  type RadioGroupComponentProps,
} from "@barqjs/aria/radio";
import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { ringSlot } from "../lib/shared-ring-slot.ts";
import { omit } from "../lib/slot.ts";
import { useFieldInvalid } from "./field.tsx";
import { when } from "../lib/shared-when.ts";

const ui = layer("barq.ui");

const items = ui({
  display: "grid",
  width: "100%",
  gap: "calc(var(--spacing) * 2)",
});

const circle = ui(
  box.border,
  box.outline,
  when.darkInput,
  ringSlot.focus,
  when.disabledCursor,
  ringSlot.invalid,
  ringSlot.invalidRing,
  ringSlot.invalidDark,
  ringSlot.invalidBorderDark,
  "group/radio-group-item peer",
  {
    position: "relative",
    display: "flex",
    aspectRatio: "1 / 1",
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
    flexShrink: "0",
    borderRadius: "calc(infinity * 1px)",
    borderColor: "var(--input)",
    // 16px is under the pointer-target minimum; the press area grows past the
    // paint, as it does on the checkbox and the switch.
    "::after": {
      content: "var(--ui-content)",
      position: "absolute",
      insetInline: "calc(var(--spacing) * -3)",
      insetBlock: "calc(var(--spacing) * -2)",
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
  },
);

const indicator = ui({
  display: "flex",
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
  alignItems: "center",
  justifyContent: "center",
});

/**
 * The dot, which is a filled circle on a filled control rather than an icon.
 *
 * Upstream stopped drawing a primary-coloured glyph on a white disc: the
 * selected radio takes the primary background the checkbox does, and the dot
 * is the foreground punched out of it.
 */
const dot = ui({
  position: "absolute",
  top: "calc(1 / 2 * 100%)",
  left: "calc(1 / 2 * 100%)",
  display: "none",
  width: "calc(var(--spacing) * 2)",
  height: "calc(var(--spacing) * 2)",
  "--ui-translate-x": "calc(calc(1 / 2 * 100%) * -1)",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  "--ui-translate-y": "calc(calc(1 / 2 * 100%) * -1)",
  borderRadius: "calc(infinity * 1px)",
  backgroundColor: "var(--primary-foreground)",
  "[data-selected] &": {
    display: "block",
  },
});

export interface RadioGroupProps extends RadioGroupComponentProps {
  /** shadcn's spelling of `onChange`. */
  onValueChange?: (value: string) => void;
  /** shadcn's spelling of `isDisabled`. */
  disabled?: boolean;
  /** shadcn's spelling of `isRequired`. */
  required?: boolean;
  /** Which way left and right run in a horizontal group. Defaults to the direction in scope. */
  dir?: "ltr" | "rtl";
  /** shadcn's spelling of `isInvalid`. Inside an invalid `<Field>` the group is invalid by default. */
  "aria-invalid"?: boolean | "true" | "false";
}

const GROUP_UPSTREAM = ["onValueChange", "disabled", "required", "aria-invalid"] as const;

/**
 * ```tsx
 * <RadioGroup label="Size" defaultValue="m">
 *   <RadioGroupItem value="s" id="s" />
 *   <Label for="s">Small</Label>
 * </RadioGroup>
 * ```
 *
 * The grid is an inner element rather than the group itself. `@barqjs/aria`
 * renders the label, description and error message as spans inside the group,
 * and a grid would give each of them a row and a gap whether it held anything
 * or not.
 */
export function RadioGroup(props: Incoming<RadioGroupProps>) {
  const inherited = useDirection();
  if (props.dir !== undefined) provideDirection(() => props.dir?.() ?? inherited());
  const inField = useFieldInvalid();
  const invalid = (): boolean => {
    const given = props.isInvalid?.() ?? props["aria-invalid"]?.();
    return given === undefined ? inField() : given === true || given === "true";
  };

  return (
    <AriaRadioGroup
      {...omit(props, GROUP_UPSTREAM)}
      data-slot="radio-group"
      isDisabled={props.isDisabled?.() ?? props.disabled?.()}
      isRequired={props.isRequired?.() ?? props.required?.()}
      isInvalid={invalid()}
      onChange={(value: string) => {
        props.onChange?.()?.(value);
        props.onValueChange?.()?.(value);
      }}
    >
      <div data-slot="radio-group-items" class={ui(items, props.class?.(), props.className?.())}>
        {props.children}
      </div>
    </AriaRadioGroup>
  );
}

export interface RadioGroupItemProps extends RadioComponentProps {
  children?: never;
  /** shadcn's spelling of `isDisabled`. */
  disabled?: boolean;
}

export function RadioGroupItem(props: Incoming<RadioGroupItemProps>) {
  return (
    <AriaRadio
      {...omit(props, ["disabled"])}
      // Written around text it is the label it used to be; on its own it is
      // the bare control, for the `<Label>` or `<Field>` that names it.
      elementType={props.children === undefined ? "span" : "label"}
      data-slot={props["data-slot"]?.() ?? "radio-group-item"}
      class={ui(circle, props.class?.(), props.className?.())}
      isDisabled={props.isDisabled?.() ?? props.disabled?.()}
    >
      <RadioGroupIndicator />
    </AriaRadio>
  );
}

function RadioGroupIndicator() {
  const item = useRadio();
  return (
    <span
      data-slot="radio-group-indicator"
      class={indicator}
      data-state={() => (item.isSelected() ? "checked" : "unchecked")}
      data-disabled={() => (item.isDisabled() ? "" : undefined)}
    >
      <span data-slot="radio-group-dot" class={dot} />
    </span>
  );
}
