import {
  ToggleButton as AriaToggleButton,
  type ToggleButtonComponentProps,
} from "@barqjs/aria/button";
import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { icon } from "../lib/shared-icon.ts";
import { ring } from "../lib/shared-ring.ts";
import { ringSlot } from "../lib/shared-ring-slot.ts";
import { text } from "../lib/shared-text.ts";
import { uiVariants } from "../lib/atoms.ts";

const ui = layer("barq.ui");

export type ToggleVariant = "default" | "outline";
export type ToggleSize = "default" | "sm" | "lg";

export const toggleVariants = uiVariants({
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
    {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "calc(var(--spacing) * 2)",
      borderRadius: "calc(var(--radius) - 2px)",
      whiteSpace: "nowrap",
      transitionProperty: "color, box-shadow",
      "@media (hover: hover)": {
        ":hover": {
          backgroundColor: "var(--muted)",
          color: "var(--muted-foreground)",
        },
      },
      ":disabled": {
        pointerEvents: "none",
        opacity: "50%",
      },
      "[data-selected]": {
        backgroundColor: "var(--accent)",
        color: "var(--accent-foreground)",
      },
    },
  ),
  variants: {
    variant: {
      default: ui({
        backgroundColor: "transparent",
      }),
      outline: ui(box.border, box.shadow, {
        borderColor: "var(--input)",
        backgroundColor: "transparent",
        "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
        "@media (hover: hover)": {
          ":hover": {
            backgroundColor: "var(--accent)",
            color: "var(--accent-foreground)",
          },
        },
      }),
    },
    size: {
      default: ui({
        height: "calc(var(--spacing) * 9)",
        minWidth: "calc(var(--spacing) * 9)",
        paddingInline: "calc(var(--spacing) * 2)",
      }),
      sm: ui({
        height: "calc(var(--spacing) * 8)",
        minWidth: "calc(var(--spacing) * 8)",
        paddingInline: "calc(var(--spacing) * 1.5)",
      }),
      lg: ui({
        height: "calc(var(--spacing) * 10)",
        minWidth: "calc(var(--spacing) * 10)",
        paddingInline: "calc(var(--spacing) * 2.5)",
      }),
    },
  },
  defaults: { variant: "default", size: "default" },
});

export interface ToggleProps extends ToggleButtonComponentProps {
  variant?: ToggleVariant;
  size?: ToggleSize;
}

/**
 * ```tsx
 * <Toggle aria-label="Bold" onChange={(on) => setBold(on)}><Bold /></Toggle>
 * ```
 *
 * `aria-pressed`, not a class: the pressed state is announced, and
 * `data-selected` is what the CSS reads.
 */
export function Toggle(props: Incoming<ToggleProps>) {
  return (
    <AriaToggleButton
      {...props}
      data-slot={props["data-slot"]?.() ?? "toggle"}
      data-variant={props.variant?.() ?? "default"}
      data-size={props.size?.() ?? "default"}
      class={ui(
        toggleVariants({ variant: props.variant?.(), size: props.size?.() }),
        props.class?.(),
        props.className?.(),
      )}
    />
  );
}
