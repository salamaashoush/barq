import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";

import { mergeRefs, type RefTarget } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { ring } from "../lib/shared-ring.ts";
import { when } from "../lib/shared-when.ts";
import type { UiProps } from "../lib/props.ts";
import { controlProps, omit, uiProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

const wrapper = ui("group/native-select", {
  position: "relative",
  width: "fit-content",
  ":has(:is(select:disabled))": {
    opacity: "50%",
  },
});

const control = ui(
  box.border,
  box.transition,
  box.outline,
  box.noSelect,
  ring.focus,
  ring.invalid,
  ring.invalidRing,
  when.darkInput,
  ring.invalidDark,
  ring.invalidBorderDark,
  {
    height: "calc(var(--spacing) * 8)",
    width: "100%",
    minWidth: "0px",
    // The chevron is a real element beside the select, so the platform's own
    // arrow has to go or there are two.
    appearance: "none",
    borderRadius: "var(--radius)",
    borderColor: "var(--input)",
    backgroundColor: "transparent",
    paddingBlock: "var(--spacing)",
    paddingRight: "calc(var(--spacing) * 8)",
    paddingLeft: "calc(var(--spacing) * 2.5)",
    fontSize: "var(--text-sm)",
    lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --ui-gradient-from, --ui-gradient-via, --ui-gradient-to",
    "::selection": {
      backgroundColor: "var(--primary)",
      color: "var(--primary-foreground)",
    },
    "::placeholder": {
      color: "var(--muted-foreground)",
    },
    ":disabled": {
      pointerEvents: "none",
      cursor: "not-allowed",
    },
    '[data-size="sm"]': {
      height: "calc(var(--spacing) * 7)",
      borderRadius: "min(var(--radius-md), 10px)",
      paddingBlock: "calc(var(--spacing) * 0.5)",
    },
    "@media (hover: hover)": {
      ":is(.dark *):hover": {
        backgroundColor: "var(--input)",
      },
      "@supports (color: color-mix(in lab, red, red))": {
        ":is(.dark *):hover": {
          backgroundColor: "color-mix(in oklab, var(--input) 50%, transparent)",
        },
      },
    },
  },
);

const icon = ui(box.noSelect, {
  pointerEvents: "none",
  position: "absolute",
  top: "calc(1 / 2 * 100%)",
  right: "calc(var(--spacing) * 2.5)",
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
  "--ui-translate-y": "calc(calc(1 / 2 * 100%) * -1)",
  translate: "var(--ui-translate-x) var(--ui-translate-y)",
  color: "var(--muted-foreground)",
});

const option = ui({
  // The system colours, not the theme's: the popup is painted by the operating
  // system and a themed background would be invisible inside it.
  backgroundColor: "Canvas",
  color: "CanvasText",
});

export type NativeSelectSize = "default" | "sm";

export interface NativeSelectProps extends UiProps {
  name?: string;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  required?: boolean;
  multiple?: boolean;
  size?: NativeSelectSize;
  form?: string;
  autoComplete?: string;
  "aria-invalid"?: boolean | "true" | "false";
  ref?: RefTarget<HTMLSelectElement>;
  onChange?: (event: Event) => void;
  onInput?: (event: Event) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
}

/**
 * The platform's own `<select>`, styled.
 *
 * There is a `<Select>` in this package that builds a listbox in a popover, and
 * on a phone the native one is still better: it opens the operating system's
 * picker, it scrolls with a thumb the user already knows, and it costs no
 * JavaScript at all.
 *
 * ```tsx
 * <NativeSelect name="plan">
 *   <NativeSelectOption value="free">Free</NativeSelectOption>
 *   <NativeSelectOption value="pro">Pro</NativeSelectOption>
 * </NativeSelect>
 * ```
 */
export function NativeSelect(props: Incoming<NativeSelectProps>) {
  const size = (): NativeSelectSize => props.size?.() ?? "default";
  return (
    <div class={wrapper} data-slot="native-select-wrapper" data-size={size()}>
      <select
        {...controlProps("native-select", control, omit(props, ["size"]))}
        data-size={size()}
        ref={mergeRefs(props.ref?.())}
      >
        {props.children}
      </select>
      <ChevronDown data-slot="native-select-icon" class={icon} aria-hidden="true" />
    </div>
  );
}

export interface NativeSelectOptionProps extends UiProps {
  value?: string;
  disabled?: boolean;
  selected?: boolean;
}

export function NativeSelectOption(props: Incoming<NativeSelectOptionProps>) {
  return <option {...controlProps("native-select-option", option, props)}>{props.children}</option>;
}

export interface NativeSelectOptGroupProps extends UiProps {
  label?: string;
  disabled?: boolean;
}

export function NativeSelectOptGroup(props: Incoming<NativeSelectOptGroupProps>) {
  return (
    <optgroup {...uiProps("native-select-optgroup", option, props)}>{props.children}</optgroup>
  );
}
