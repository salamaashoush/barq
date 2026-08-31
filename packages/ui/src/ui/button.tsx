import { Button as AriaButton, type ButtonComponentProps } from "@barqjs/aria/button";
import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import { uiVariants } from "../lib/atoms.ts";

const ui = layer("barq.ui");

export type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";

export type ButtonSize =
  | "default"
  | "xs"
  | "sm"
  | "lg"
  | "icon"
  | "icon-xs"
  | "icon-sm"
  | "icon-lg";

/**
 * The classes, without the component.
 *
 * shadcn reaches for Radix's `Slot` and `asChild` when a button has to be an
 * `<a>`; this hands the classes over instead, which needs no runtime and no
 * cloning of anyone's element:
 *
 * ```tsx
 * <a href="/pricing" class={buttonVariants({ variant: "outline" })}>Pricing</a>
 * ```
 */
export const buttonVariants = uiVariants({
  base: ui({
    display: "inline-flex",
    flexShrink: "0",
    alignItems: "center",
    justifyContent: "center",
    gap: "calc(var(--spacing) * 2)",
    borderRadius: "calc(var(--radius) - 2px)",
    fontSize: "var(--text-sm)",
    lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
    "--ui-font-weight": "var(--font-weight-medium)",
    fontWeight: "var(--font-weight-medium)",
    whiteSpace: "nowrap",
    transitionProperty: "all",
    transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
    transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
    "--ui-outline-style": "none",
    outlineStyle: "none",
    ":focus-visible": {
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
        backgroundColor: "var(--primary)",
        color: "var(--primary-foreground)",
        "@media (hover: hover)": {
          ":hover": {
            backgroundColor: "var(--primary)",
          },
          "@supports (color: color-mix(in lab, red, red))": {
            ":hover": {
              backgroundColor: "color-mix(in oklab, var(--primary) 90%, transparent)",
            },
          },
        },
      }),
      destructive: ui({
        backgroundColor: "var(--destructive)",
        color: "var(--color-white)",
        "@media (hover: hover)": {
          ":hover": {
            backgroundColor: "var(--destructive)",
          },
          "@supports (color: color-mix(in lab, red, red))": {
            ":hover": {
              backgroundColor: "color-mix(in oklab, var(--destructive) 90%, transparent)",
            },
          },
        },
        ":focus-visible": {
          "--ui-ring-color": "var(--destructive)",
          "@supports (color: color-mix(in lab, red, red))": {
            "--ui-ring-color": "color-mix(in oklab, var(--destructive) 20%, transparent)",
          },
        },
        ":is(.dark *)": {
          backgroundColor: "var(--destructive)",
          "@supports (color: color-mix(in lab, red, red))": {
            backgroundColor: "color-mix(in oklab, var(--destructive) 60%, transparent)",
          },
        },
        ":is(.dark *):focus-visible": {
          "--ui-ring-color": "var(--destructive)",
          "@supports (color: color-mix(in lab, red, red))": {
            "--ui-ring-color": "color-mix(in oklab, var(--destructive) 40%, transparent)",
          },
        },
      }),
      outline: ui({
        borderStyle: "var(--ui-border-style)",
        borderWidth: "1px",
        backgroundColor: "var(--background)",
        "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
        boxShadow:
          "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
        "@media (hover: hover)": {
          ":hover": {
            backgroundColor: "var(--accent)",
            color: "var(--accent-foreground)",
          },
          ":is(.dark *):hover": {
            backgroundColor: "var(--input)",
          },
          "@supports (color: color-mix(in lab, red, red))": {
            ":is(.dark *):hover": {
              backgroundColor: "color-mix(in oklab, var(--input) 50%, transparent)",
            },
          },
        },
        ":is(.dark *)": {
          borderColor: "var(--input)",
          backgroundColor: "var(--input)",
          "@supports (color: color-mix(in lab, red, red))": {
            backgroundColor: "color-mix(in oklab, var(--input) 30%, transparent)",
          },
        },
      }),
      secondary: ui({
        backgroundColor: "var(--secondary)",
        color: "var(--secondary-foreground)",
        "@media (hover: hover)": {
          ":hover": {
            backgroundColor: "var(--secondary)",
          },
          "@supports (color: color-mix(in lab, red, red))": {
            ":hover": {
              backgroundColor: "color-mix(in oklab, var(--secondary) 80%, transparent)",
            },
          },
        },
      }),
      ghost: ui({
        "@media (hover: hover)": {
          ":hover": {
            backgroundColor: "var(--accent)",
            color: "var(--accent-foreground)",
          },
          ":is(.dark *):hover": {
            backgroundColor: "var(--accent)",
          },
          "@supports (color: color-mix(in lab, red, red))": {
            ":is(.dark *):hover": {
              backgroundColor: "color-mix(in oklab, var(--accent) 50%, transparent)",
            },
          },
        },
      }),
      link: ui({
        color: "var(--primary)",
        textUnderlineOffset: "4px",
        "@media (hover: hover)": {
          ":hover": {
            textDecorationLine: "underline",
          },
        },
      }),
    },
    size: {
      default: ui({
        height: "calc(var(--spacing) * 9)",
        paddingInline: "calc(var(--spacing) * 4)",
        paddingBlock: "calc(var(--spacing) * 2)",
        ":has(> svg)": {
          paddingInline: "calc(var(--spacing) * 3)",
        },
      }),
      xs: ui({
        height: "calc(var(--spacing) * 6)",
        gap: "var(--spacing)",
        borderRadius: "calc(var(--radius) - 2px)",
        paddingInline: "calc(var(--spacing) * 2)",
        fontSize: "var(--text-xs)",
        lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
        ":has(> svg)": {
          paddingInline: "calc(var(--spacing) * 1.5)",
        },
        '& svg:not([class*="size-"])': {
          width: "calc(var(--spacing) * 3)",
          height: "calc(var(--spacing) * 3)",
        },
      }),
      sm: ui({
        height: "calc(var(--spacing) * 8)",
        gap: "calc(var(--spacing) * 1.5)",
        borderRadius: "calc(var(--radius) - 2px)",
        paddingInline: "calc(var(--spacing) * 3)",
        ":has(> svg)": {
          paddingInline: "calc(var(--spacing) * 2.5)",
        },
      }),
      lg: ui({
        height: "calc(var(--spacing) * 10)",
        borderRadius: "calc(var(--radius) - 2px)",
        paddingInline: "calc(var(--spacing) * 6)",
        ":has(> svg)": {
          paddingInline: "calc(var(--spacing) * 4)",
        },
      }),
      icon: ui({
        width: "calc(var(--spacing) * 9)",
        height: "calc(var(--spacing) * 9)",
      }),
      "icon-xs": ui({
        width: "calc(var(--spacing) * 6)",
        height: "calc(var(--spacing) * 6)",
        borderRadius: "calc(var(--radius) - 2px)",
        '& svg:not([class*="size-"])': {
          width: "calc(var(--spacing) * 3)",
          height: "calc(var(--spacing) * 3)",
        },
      }),
      "icon-sm": ui({
        width: "calc(var(--spacing) * 8)",
        height: "calc(var(--spacing) * 8)",
      }),
      "icon-lg": ui({
        width: "calc(var(--spacing) * 10)",
        height: "calc(var(--spacing) * 10)",
      }),
    },
  },
  defaults: { variant: "default", size: "default" },
});

export interface ButtonProps extends ButtonComponentProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renames the slot, for a wrapper that is a button and answers to another name. */
  "data-slot"?: string;
}

/**
 * ```tsx
 * <Button variant="outline" size="sm" onPress={() => save()}>Save</Button>
 * ```
 *
 * The press comes from `@barqjs/aria`, so it begins on pointer-down, cancels
 * when the pointer leaves, and does not wait for a click on touch.
 */
export function Button(props: Incoming<ButtonProps>) {
  return (
    <AriaButton
      {...props}
      data-slot={props["data-slot"]?.() ?? "button"}
      data-variant={props.variant?.() ?? "default"}
      data-size={props.size?.() ?? "default"}
      class={ui(
        buttonVariants({ variant: props.variant?.(), size: props.size?.() }),
        props.class?.(),
        props.className?.(),
      )}
    />
  );
}
