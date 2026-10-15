import {
  ToggleButton as AriaToggleButton,
  toggleState,
  type ToggleButtonComponentProps,
} from "@barqjs/aria/button";
import type { Incoming } from "@barqjs/core";
import { layer, variants } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { icon } from "../lib/shared-icon.ts";
import { ring } from "../lib/shared-ring.ts";
import { ringSlot } from "../lib/shared-ring-slot.ts";
import { omit } from "../lib/slot.ts";
import { text } from "../lib/shared-text.ts";

const ui = layer("barq.ui");

export type ToggleVariant = "default" | "outline";
export type ToggleSize = "default" | "sm" | "lg";

export const toggleVariants = variants({
  base: ui(
    text.sm,
    text.medium,
    box.transition,
    box.outline,
    ring.invalid,
    ring.invalidDark,
    ringSlot.focus,
    icon.plain,
    icon.sized,
    // A marker: the group welds its items by reading `.group\/toggle`.
    "group/toggle",
    {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "var(--spacing)",
      borderRadius: "var(--radius)",
      whiteSpace: "nowrap",
      transitionProperty: "all",
      "@media (hover: hover)": {
        ":hover": {
          backgroundColor: "var(--muted)",
          color: "var(--foreground)",
        },
      },
      ":disabled": {
        pointerEvents: "none",
        opacity: "50%",
      },
      // `aria-pressed` as well as the attribute `@barqjs/aria` writes: a
      // caller rendering the classes on a button of their own has the ARIA and
      // not the data attribute, and upstream styles both.
      '[aria-pressed="true"]': {
        backgroundColor: "var(--muted)",
      },
      "[data-selected]": {
        backgroundColor: "var(--muted)",
      },
    },
  ),
  variants: {
    variant: {
      default: ui({
        backgroundColor: "transparent",
      }),
      outline: ui(box.border, {
        borderColor: "var(--input)",
        backgroundColor: "transparent",
        "@media (hover: hover)": {
          ":hover": {
            backgroundColor: "var(--muted)",
          },
        },
      }),
    },
    size: {
      default: ui({
        height: "calc(var(--spacing) * 8)",
        minWidth: "calc(var(--spacing) * 8)",
        paddingInline: "calc(var(--spacing) * 2.5)",
        ':has([data-icon="inline-end"])': {
          paddingInlineEnd: "calc(var(--spacing) * 2)",
        },
        ':has([data-icon="inline-start"])': {
          paddingInlineStart: "calc(var(--spacing) * 2)",
        },
      }),
      sm: ui({
        height: "calc(var(--spacing) * 7)",
        minWidth: "calc(var(--spacing) * 7)",
        borderRadius: "min(var(--radius-md), 12px)",
        paddingInline: "calc(var(--spacing) * 2.5)",
        fontSize: "0.8rem",
        ':has([data-icon="inline-end"])': {
          paddingInlineEnd: "calc(var(--spacing) * 1.5)",
        },
        ':has([data-icon="inline-start"])': {
          paddingInlineStart: "calc(var(--spacing) * 1.5)",
        },
        "& svg:not([class*='size-'])": {
          width: "calc(var(--spacing) * 3.5)",
          height: "calc(var(--spacing) * 3.5)",
        },
      }),
      lg: ui({
        height: "calc(var(--spacing) * 9)",
        minWidth: "calc(var(--spacing) * 9)",
        paddingInline: "calc(var(--spacing) * 2.5)",
        ':has([data-icon="inline-end"])': {
          paddingInlineEnd: "calc(var(--spacing) * 2)",
        },
        ':has([data-icon="inline-start"])': {
          paddingInlineStart: "calc(var(--spacing) * 2)",
        },
      }),
    },
  },
  defaults: { variant: "default", size: "default" },
});

export interface ToggleProps extends ToggleButtonComponentProps {
  variant?: ToggleVariant;
  size?: ToggleSize;
  /** The same as `isSelected`, under the name shadcn's `Toggle` uses. */
  pressed?: boolean;
  /** The same as `defaultSelected`. */
  defaultPressed?: boolean;
  /** Called beside `onChange`, with the same argument. */
  onPressedChange?: (pressed: boolean) => void;
  /** The same as `isDisabled`. */
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "data-orientation"?: "horizontal" | "vertical";
  "data-spacing"?: string;
}

const ALIASES = ["pressed", "defaultPressed", "onPressedChange", "disabled", "variant", "size"];

/**
 * ```tsx
 * <Toggle aria-label="Bold" onChange={(on) => setBold(on)}><Bold /></Toggle>
 * ```
 *
 * `aria-pressed`, not a class: the pressed state is announced, and
 * `data-selected` is what the CSS reads. `data-state` says the same thing as
 * `on` or `off`, for a rule written against shadcn's markup.
 */
export function Toggle(props: Incoming<ToggleProps>) {
  // Held here and handed down controlled, so the attribute below and the
  // button's own `aria-pressed` read one value.
  const state = toggleState({
    isSelected: () => props.pressed?.() ?? props.isSelected?.(),
    defaultSelected: () => props.defaultPressed?.() ?? props.defaultSelected?.(),
    onChange(next) {
      props.onChange?.()?.(next);
      props.onPressedChange?.()?.(next);
    },
  });

  return (
    <AriaToggleButton
      {...omit(props, ALIASES)}
      isSelected={state.isSelected()}
      onChange={(next: boolean) => state.setSelected(next)}
      isDisabled={props.isDisabled?.() ?? props.disabled?.()}
      data-slot={props["data-slot"]?.() ?? "toggle"}
      data-variant={props.variant?.() ?? "default"}
      data-size={props.size?.() ?? "default"}
      data-state={state.isSelected() ? "on" : "off"}
      class={ui(
        toggleVariants({ variant: props.variant?.(), size: props.size?.() }),
        props.class?.(),
        props.className?.(),
      )}
    />
  );
}
