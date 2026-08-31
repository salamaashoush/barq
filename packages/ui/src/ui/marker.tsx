import type { Child, Incoming } from "@barqjs/core";
import { layer, variants } from "@barqjs/css";

import "../theme/layers.ts";
import { icon as iconGroup } from "../lib/shared-icon.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

export type MarkerVariant = "default" | "separator" | "border";

export const markerVariants = variants({
  base: ui(text.sm, iconGroup.sized, {
    position: "relative",
    display: "flex",
    minHeight: "calc(var(--spacing) * 4)",
    width: "100%",
    alignItems: "center",
    gap: "calc(var(--spacing) * 2)",
    textAlign: "left",
    color: "var(--muted-foreground)",
    "& a": {
      textDecorationLine: "underline",
      textUnderlineOffset: "3px",
    },
    "@media (hover: hover)": {
      "& a:hover": {
        color: "var(--foreground)",
      },
    },
  }),
  variants: {
    variant: {
      default: "",
      separator: ui({
        "::before": {
          content: "var(--ui-content)",
          marginRight: "var(--spacing)",
          height: "1px",
          minWidth: "0px",
          flex: "1",
          backgroundColor: "var(--border)",
        },
        "::after": {
          content: "var(--ui-content)",
          marginLeft: "var(--spacing)",
          height: "1px",
          minWidth: "0px",
          flex: "1",
          backgroundColor: "var(--border)",
        },
      }),
      border: ui({
        borderBottomStyle: "var(--ui-border-style)",
        borderBottomWidth: "1px",
        borderColor: "var(--border)",
        paddingBottom: "calc(var(--spacing) * 2)",
      }),
    },
  },
  defaults: { variant: "default" },
});

const iconBox = ui(iconGroup.sized, {
  width: "calc(var(--spacing) * 4)",
  height: "calc(var(--spacing) * 4)",
  flexShrink: "0",
});

const content = ui({
  minWidth: "0px",
  overflowWrap: "break-word",
  // The separator variant centres its label between the two rules, so the
  // label must stop growing or there is nothing left for them to fill.
  '[data-slot="marker"][data-variant="separator"] &': {
    flex: "none",
    textAlign: "center",
  },
  "& > a": {
    textDecorationLine: "underline",
    textUnderlineOffset: "3px",
  },
  "@media (hover: hover)": {
    "& > a:hover": {
      color: "var(--foreground)",
    },
  },
});

export interface MarkerProps extends UiProps {
  /** @default "default" */
  variant?: MarkerVariant;
}

/**
 * A line of secondary text between blocks: a timestamp, a day, "unread".
 *
 * The `separator` variant is the one that earns the component. It draws a rule
 * either side of its label with pseudo-elements, so the label stays centred
 * whatever its length and no measurement is involved.
 *
 * ```tsx
 * <Marker variant="separator">
 *   <MarkerContent>Yesterday</MarkerContent>
 * </Marker>
 * ```
 */
export function Marker(props: Incoming<MarkerProps>) {
  return (
    <div
      {...uiProps(
        "marker",
        () => ui(markerVariants({ variant: props.variant?.() }), "group/marker"),
        props,
      )}
      data-variant={props.variant?.() ?? "default"}
    >
      {props.children}
    </div>
  );
}

/** Decoration beside the label, and hidden from a screen reader for that reason. */
export function MarkerIcon(props: Incoming<UiProps>) {
  return (
    <span {...uiProps("marker-icon", iconBox, props)} aria-hidden="true">
      {props.children}
    </span>
  );
}

export function MarkerContent(props: Incoming<{ children?: Child } & UiProps>) {
  return <span {...uiProps("marker-content", content, props)}>{props.children}</span>;
}
