import type { Incoming } from "@barqjs/core";
import { layer, variants } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

export type AlertVariant = "default" | "destructive";

export const alertVariants = variants({
  // A marker: the title reads `.group\/alert:has(>svg)` to know whether the
  // grid opened an icon column it has to start after.
  base: ui(box.border, text.sm, "group/alert", {
    position: "relative",
    display: "grid",
    width: "100%",
    gap: "calc(var(--spacing) * 0.5)",
    borderRadius: "var(--radius)",
    paddingInline: "calc(var(--spacing) * 2.5)",
    paddingBlock: "calc(var(--spacing) * 2)",
    textAlign: "start",
    // The action sits over the text, so the text stops short of it.
    ':has([data-slot="alert-action"])': {
      position: "relative",
      paddingInlineEnd: "calc(var(--spacing) * 18)",
    },
    ":has( > svg)": {
      gridTemplateColumns: "auto 1fr",
      columnGap: "calc(var(--spacing) * 2)",
    },
    ":is(& > *):is(svg)": {
      gridRow: "span 2 / span 2",
      "--ui-translate-y": "calc(var(--spacing) * 0.5)",
      translate: "var(--ui-translate-x) var(--ui-translate-y)",
      color: "currentcolor",
    },
    ":is(& > *):is(svg:not([class*='size-']))": {
      width: "calc(var(--spacing) * 4)",
      height: "calc(var(--spacing) * 4)",
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
        ":is(& > *):is(svg)": {
          color: "currentcolor",
        },
      }),
    },
  },
  defaults: { variant: "default" },
});

// The title only takes the second column when there IS one. It used to start
// at column 2 unconditionally, which left an empty gutter in an alert with no
// icon.
const title = ui(text.medium, {
  ":is(:where(.group\\/alert):has( > svg) *)": {
    gridColumnStart: "2",
  },
  "& a": {
    textDecorationLine: "underline",
    textUnderlineOffset: "3px",
  },
  "@media (hover: hover)": {
    "& a:hover": {
      color: "var(--foreground)",
    },
  },
});

const description = ui(text.sm, {
  textWrap: "balance",
  color: "var(--muted-foreground)",
  "@media (width >= 48rem)": {
    "&": {
      textWrap: "pretty",
    },
  },
  "& a": {
    textDecorationLine: "underline",
    textUnderlineOffset: "3px",
  },
  "@media (hover: hover)": {
    "& a:hover": {
      color: "var(--foreground)",
    },
  },
  "& p:not(:last-child)": {
    marginBottom: "calc(var(--spacing) * 4)",
  },
});

const action = ui({
  position: "absolute",
  top: "calc(var(--spacing) * 2)",
  insetInlineEnd: "calc(var(--spacing) * 2)",
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

/** A control in the corner: dismiss, retry, the one thing the alert offers. */
export function AlertAction(props: Incoming<UiProps>) {
  return <div {...uiProps("alert-action", action, props)}>{props.children}</div>;
}
