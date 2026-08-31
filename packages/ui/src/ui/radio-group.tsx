import {
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  type RadioComponentProps,
  type RadioGroupComponentProps,
} from "@barqjs/aria/radio";
import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import { Circle } from "@barqjs/lucide/icons/circle";

import "../theme/layers.ts";
import { shared } from "../lib/shared.ts";

const ui = layer("barq.ui");

const items = ui({
  display: "grid",
  gap: "calc(var(--spacing) * 3)",
});

const circle = ui(
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
    position: "relative",
    display: "inline-flex",
    aspectRatio: "1 / 1",
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
    flexShrink: "0",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "calc(infinity * 1px)",
    borderColor: "var(--input)",
    color: "var(--primary)",
    "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
    transitionProperty: "color, box-shadow",
  },
);

const indicator = ui({
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  "& > svg": {
    position: "absolute",
    top: "calc(1 / 2 * 100%)",
    left: "calc(1 / 2 * 100%)",
    display: "none",
    width: "calc(var(--spacing) * 2)",
    height: "calc(var(--spacing) * 2)",
    "--ui-translate-x": "calc(calc(1 / 2 * 100%) * -1)",
    translate: "var(--ui-translate-x) var(--ui-translate-y)",
    "--ui-translate-y": "calc(calc(1 / 2 * 100%) * -1)",
    fill: "var(--primary)",
    stroke: "var(--primary)",
  },
  "[data-selected] & > svg": {
    display: "block",
  },
});

export interface RadioGroupProps extends RadioGroupComponentProps {}

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
  return (
    <AriaRadioGroup {...props} data-slot="radio-group">
      <div data-slot="radio-group-items" class={ui(items, props.class?.(), props.className?.())}>
        {props.children}
      </div>
    </AriaRadioGroup>
  );
}

export interface RadioGroupItemProps extends RadioComponentProps {
  children?: never;
}

export function RadioGroupItem(props: Incoming<RadioGroupItemProps>) {
  return (
    <AriaRadio
      {...props}
      data-slot={props["data-slot"]?.() ?? "radio-group-item"}
      class={ui(circle, props.class?.(), props.className?.())}
    >
      <span data-slot="radio-group-indicator" class={indicator}>
        <Circle />
      </span>
    </AriaRadio>
  );
}
