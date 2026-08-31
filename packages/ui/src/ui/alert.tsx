import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import { uiVariants } from "../lib/atoms.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

export type AlertVariant = "default" | "destructive";

export const alertVariants = uiVariants({
  base: ui({
    position: "relative",
    display: "grid",
    width: "100%",
    gridTemplateColumns: "0 1fr",
    alignItems: "flex-start",
    rowGap: "calc(var(--spacing) * 0.5)",
    borderRadius: "var(--radius)",
    borderStyle: "var(--ui-border-style)",
    borderWidth: "1px",
    paddingInline: "calc(var(--spacing) * 4)",
    paddingBlock: "calc(var(--spacing) * 3)",
    fontSize: "var(--text-sm)",
    lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
    ":has(> svg)": {
      gridTemplateColumns: "calc(var(--spacing) * 4) 1fr",
      columnGap: "calc(var(--spacing) * 3)",
    },
    "& > svg": {
      width: "calc(var(--spacing) * 4)",
      height: "calc(var(--spacing) * 4)",
      "--ui-translate-y": "calc(var(--spacing) * 0.5)",
      translate: "var(--ui-translate-x) var(--ui-translate-y)",
      color: "currentcolor",
    },
  }),
  variants: {
    variant: {
      default: ui({
        backgroundColor: "var(--card)",
        color: "var(--card-foreground)",
      }),
      destructive: ui({
        backgroundColor: "var(--card)",
        color: "var(--destructive)",
        ':is(& > *)[data-slot="alert-description"]': {
          color: "var(--destructive)",
          "@supports (color: color-mix(in lab, red, red))": {
            color: "color-mix(in oklab, var(--destructive) 90%, transparent)",
          },
        },
        "& > svg": {
          color: "currentcolor",
        },
      }),
    },
  },
  defaults: { variant: "default" },
});

const title = ui({
  gridColumnStart: "2",
  overflow: "hidden",
  display: "-webkit-box",
  "-webkit-box-orient": "vertical",
  "-webkit-line-clamp": "1",
  minHeight: "calc(var(--spacing) * 4)",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  "--ui-tracking": "var(--tracking-tight)",
  letterSpacing: "var(--tracking-tight)",
});

const description = ui({
  gridColumnStart: "2",
  display: "grid",
  justifyItems: "start",
  gap: "var(--spacing)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  color: "var(--muted-foreground)",
  "& p": {
    "--ui-leading": "var(--leading-relaxed)",
    lineHeight: "var(--leading-relaxed)",
  },
});

export interface AlertProps extends UiProps {
  variant?: AlertVariant;
}

/**
 * ```tsx
 * <Alert variant="destructive">
 *   <TriangleAlert />
 *   <AlertTitle>Payment failed</AlertTitle>
 *   <AlertDescription>The card was declined.</AlertDescription>
 * </Alert>
 * ```
 *
 * An icon is an ordinary child. The grid finds it with `:has(> svg)` and opens
 * a column for it, so there is no slot to remember and no prop to set.
 */
export function Alert(props: Incoming<AlertProps>) {
  const className = (): string => alertVariants({ variant: props.variant?.() });
  return (
    <div
      {...uiProps("alert", className, props)}
      role={props.role?.() ?? "alert"}
      data-variant={props.variant?.() ?? "default"}
    >
      {props.children}
    </div>
  );
}

export function AlertTitle(props: Incoming<UiProps>) {
  return <div {...uiProps("alert-title", title, props)}>{props.children}</div>;
}

export function AlertDescription(props: Incoming<UiProps>) {
  return <div {...uiProps("alert-description", description, props)}>{props.children}</div>;
}
