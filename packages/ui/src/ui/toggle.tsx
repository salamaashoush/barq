import {
  ToggleButton as AriaToggleButton,
  type ToggleButtonComponentProps,
} from "@barqjs/aria/button";
import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import { uiVariants } from "../lib/atoms.ts";

const ui = layer("barq.ui");

export type ToggleVariant = "default" | "outline";
export type ToggleSize = "default" | "sm" | "lg";

export const toggleVariants = uiVariants({
  base: ui({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "calc(var(--spacing) * 2)",
    borderRadius: "calc(var(--radius) - 2px)",
    fontSize: "var(--text-sm)",
    lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
    "--ui-font-weight": "var(--font-weight-medium)",
    fontWeight: "var(--font-weight-medium)",
    whiteSpace: "nowrap",
    transitionProperty: "color, box-shadow",
    transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
    transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
    "--ui-outline-style": "none",
    outlineStyle: "none",
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
    '[aria-invalid="true"]': {
      borderColor: "var(--destructive)",
      "--ui-ring-color": "var(--destructive)",
      "@supports (color: color-mix(in lab, red, red))": {
        "--ui-ring-color": "color-mix(in oklab, var(--destructive) 20%, transparent)",
      },
    },
    ':is(.dark *)[aria-invalid="true"]': {
      "--ui-ring-color": "var(--destructive)",
      "@supports (color: color-mix(in lab, red, red))": {
        "--ui-ring-color": "color-mix(in oklab, var(--destructive) 40%, transparent)",
      },
    },
    "[data-selected]": {
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)",
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
    "& svg": {
      pointerEvents: "none",
      flexShrink: "0",
    },
    '& svg:not([class*="size-"])': {
      width: "calc(var(--spacing) * 4)",
      height: "calc(var(--spacing) * 4)",
    },
  }),
  variants: {
    variant: {
      default: ui({
        backgroundColor: "transparent",
      }),
      outline: ui({
        borderStyle: "var(--ui-border-style)",
        borderWidth: "1px",
        borderColor: "var(--input)",
        backgroundColor: "transparent",
        "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
        boxShadow:
          "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
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
