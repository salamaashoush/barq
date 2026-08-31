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
  base: ui(box.border, text.medium, box.transition, ring.focus, ring.invalid, ring.invalidDark, {
    display: "inline-flex",
    width: "fit-content",
    flexShrink: "0",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--spacing)",
    overflow: "hidden",
    borderRadius: "calc(infinity * 1px)",
    borderColor: "transparent",
    paddingInline: "calc(var(--spacing) * 2)",
    paddingBlock: "calc(var(--spacing) * 0.5)",
    fontSize: "var(--text-xs)",
    lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
    whiteSpace: "nowrap",
    transitionProperty: "color, box-shadow",
    "& > svg": {
      pointerEvents: "none",
      width: "calc(var(--spacing) * 3)",
      height: "calc(var(--spacing) * 3)",
    },
  }),
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
              backgroundColor: "color-mix(in oklab, var(--primary) 90%, transparent)",
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
              backgroundColor: "color-mix(in oklab, var(--secondary) 90%, transparent)",
            },
          },
        },
      }),
      destructive: ui({
        backgroundColor: "var(--destructive)",
        color: "var(--color-white)",
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
        "@media (hover: hover)": {
          "a&:hover": {
            backgroundColor: "var(--destructive)",
          },
          "@supports (color: color-mix(in lab, red, red))": {
            "a&:hover": {
              backgroundColor: "color-mix(in oklab, var(--destructive) 90%, transparent)",
            },
          },
        },
      }),
      outline: ui({
        borderColor: "var(--border)",
        color: "var(--foreground)",
        "@media (hover: hover)": {
          "a&:hover": {
            backgroundColor: "var(--accent)",
            color: "var(--accent-foreground)",
          },
        },
      }),
      ghost: ui({
        "@media (hover: hover)": {
          "a&:hover": {
            backgroundColor: "var(--accent)",
            color: "var(--accent-foreground)",
          },
        },
      }),
      link: ui({
        color: "var(--primary)",
        textUnderlineOffset: "4px",
        "@media (hover: hover)": {
          "a&:hover": {
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
