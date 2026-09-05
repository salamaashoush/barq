import { Show, type Incoming } from "@barqjs/core";
import { layer, variants } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { ring } from "../lib/shared-ring.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

export type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";

/**
 * The classes, for a badge you render yourself.
 *
 * ```tsx
 * <button type="button" class={badgeVariants({ variant: "outline" })}>Draft</button>
 * ```
 */
export const badgeVariants = variants({
  base: ui(
    box.border,
    text.medium,
    box.transition,
    ring.focus,
    ring.invalid,
    ring.invalidDark,
    // A marker: upstream's styles compile to `.group\/badge:has(…)`.
    "group/badge",
    {
      display: "inline-flex",
      height: "calc(var(--spacing) * 5)",
      width: "fit-content",
      flexShrink: "0",
      alignItems: "center",
      justifyContent: "center",
      gap: "var(--spacing)",
      overflow: "hidden",
      borderRadius: "calc(var(--radius) * 2.6)",
      borderColor: "transparent",
      paddingInline: "calc(var(--spacing) * 2)",
      paddingBlock: "calc(var(--spacing) * 0.5)",
      fontSize: "var(--text-xs)",
      lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
      whiteSpace: "nowrap",
      transitionProperty: "all",
      // An icon on one side takes the padding in on that side, so the badge
      // does not sit lopsided around it.
      ':has([data-icon="inline-end"])': {
        paddingRight: "calc(var(--spacing) * 1.5)",
      },
      ':has([data-icon="inline-start"])': {
        paddingLeft: "calc(var(--spacing) * 1.5)",
      },
      "& > svg": {
        pointerEvents: "none",
        width: "calc(var(--spacing) * 3) !important",
        height: "calc(var(--spacing) * 3) !important",
      },
    },
  ),
  variants: {
    variant: {
      default: ui({
        backgroundColor: "var(--primary)",
        color: "var(--primary-foreground)",
        "@media (hover: hover)": {
          "a&:hover": {
            backgroundColor: "var(--primary)",
          },
          "@supports (color: color-mix(in lab, red, red))": {
            "a&:hover": {
              backgroundColor: "color-mix(in oklab, var(--primary) 80%, transparent)",
            },
          },
        },
      }),
      secondary: ui({
        backgroundColor: "var(--secondary)",
        color: "var(--secondary-foreground)",
        "@media (hover: hover)": {
          "a&:hover": {
            backgroundColor: "var(--secondary)",
          },
          "@supports (color: color-mix(in lab, red, red))": {
            "a&:hover": {
              backgroundColor: "color-mix(in oklab, var(--secondary) 80%, transparent)",
            },
          },
        },
      }),
      destructive: ui({
        backgroundColor: "var(--destructive)",
        color: "var(--destructive)",
        "@supports (color: color-mix(in lab, red, red))": {
          backgroundColor: "color-mix(in oklab, var(--destructive) 10%, transparent)",
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
            backgroundColor: "color-mix(in oklab, var(--destructive) 20%, transparent)",
          },
        },
        ":is(.dark *):focus-visible": {
          "--ui-ring-color": "var(--destructive)",
          "@supports (color: color-mix(in lab, red, red))": {
            "--ui-ring-color": "color-mix(in oklab, var(--destructive) 40%, transparent)",
          },
        },
        "@media (hover: hover)": {
          "a&:hover": {
            backgroundColor: "var(--destructive)",
          },
          "@supports (color: color-mix(in lab, red, red))": {
            "a&:hover": {
              backgroundColor: "color-mix(in oklab, var(--destructive) 20%, transparent)",
            },
          },
        },
      }),
      outline: ui({
        borderColor: "var(--border)",
        color: "var(--foreground)",
        "@media (hover: hover)": {
          "a&:hover": {
            backgroundColor: "var(--muted)",
            color: "var(--muted-foreground)",
          },
        },
      }),
      // Not `a&`: upstream hovers a ghost badge whether it links anywhere or
      // not, which is what makes it the variant a filter chip wears.
      ghost: ui({
        "@media (hover: hover)": {
          ":hover": {
            backgroundColor: "var(--muted)",
            color: "var(--muted-foreground)",
          },
          ":is(.dark *):hover": {
            backgroundColor: "var(--muted)",
          },
          "@supports (color: color-mix(in lab, red, red))": {
            ":is(.dark *):hover": {
              backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
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
  },
  defaults: { variant: "default" },
});

export interface BadgeProps extends UiProps {
  variant?: BadgeVariant;
  /** Renders an `<a>` instead of a `<span>`. The hover styles are written for it. */
  href?: string;
  target?: string;
  rel?: string;
}

/**
 * ```tsx
 * <Badge>New</Badge>
 * <Badge variant="destructive">Overdue</Badge>
 * <Badge variant="outline" href="/tags/rust">rust</Badge>
 * ```
 */
export function Badge(props: Incoming<BadgeProps>) {
  const className = (): string => badgeVariants({ variant: props.variant?.() });
  const common = (): Record<string, unknown> => ({
    ...uiProps("badge", className, props),
    "data-variant": props.variant?.() ?? "default",
  });

  return (
    <Show
      when={props.href?.() !== undefined}
      fallback={<span {...common()}>{props.children}</span>}
    >
      <a {...common()} href={props.href?.()} target={props.target?.()} rel={props.rel?.()}>
        {props.children}
      </a>
    </Show>
  );
}
