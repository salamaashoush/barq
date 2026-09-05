import type { Incoming } from "@barqjs/core";
import { firstThatWorks, layer } from "@barqjs/css";

import "../theme/layers.ts";
import { box } from "../lib/shared-box.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

const card = ui(
  text.sm,
  box.shadow,
  // A marker: the title reads the card's size back through
  // `.group\/card[data-size=sm]`.
  "group/card",
  {
    display: "flex",
    flexDirection: "column",
    gap: "var(--card-spacing)",
    overflow: "hidden",
    borderRadius: "calc(var(--radius) * 1.4)",
    backgroundColor: "var(--card)",
    paddingBlock: "var(--card-spacing)",
    color: "var(--card-foreground)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(1px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    "--ui-ring-color": "var(--foreground)",
    "--card-spacing": "calc(var(--spacing) * 4)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--foreground) 10%, transparent)",
    },
    ':has([data-slot="card-footer"])': {
      paddingBottom: "0px",
    },
    ":has( > img:first-child)": {
      paddingTop: "0px",
    },
    '[data-size="sm"]': {
      "--card-spacing": "calc(var(--spacing) * 3)",
    },
    '[data-size="sm"]:has([data-slot="card-footer"])': {
      paddingBottom: "0px",
    },
    ":is(& > *):is(img:first-child)": {
      borderTopLeftRadius: "calc(var(--radius) * 1.4)",
      borderTopRightRadius: "calc(var(--radius) * 1.4)",
    },
    ":is(& > *):is(img:last-child)": {
      borderBottomRightRadius: "calc(var(--radius) * 1.4)",
      borderBottomLeftRadius: "calc(var(--radius) * 1.4)",
    },
  },
);

const header = ui("group/card-header", {
  containerType: "inline-size",
  containerName: "card-header",
  display: "grid",
  gridAutoRows: "min-content",
  alignItems: "flex-start",
  gap: "var(--spacing)",
  borderTopLeftRadius: "calc(var(--radius) * 1.4)",
  borderTopRightRadius: "calc(var(--radius) * 1.4)",
  paddingInline: "var(--card-spacing)",
  ':has([data-slot="card-action"])': {
    gridTemplateColumns: "1fr auto",
  },
  ':has([data-slot="card-description"])': {
    gridTemplateRows: "auto auto",
  },
  ":is(.border-b)": {
    paddingBottom: "var(--card-spacing)",
  },
});

const headerBordered = ui({
  borderBottomStyle: "var(--ui-border-style)",
  borderBottomWidth: "1px",
});

const title = ui(text.heading, text.medium, {
  fontSize: "var(--text-base)",
  lineHeight: firstThatWorks(
    "var(--leading-snug)",
    "var(--ui-leading, var(--text-base--line-height))",
  ),
  "--ui-leading": "var(--leading-snug)",
  ':is(:where(.group\\/card)[data-size="sm"] *)': {
    fontSize: "var(--text-sm)",
    lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  },
});

const description = ui(text.sm, {
  color: "var(--muted-foreground)",
});

const action = ui({
  gridColumnStart: "2",
  gridRow: "span 2 / span 2",
  gridRowStart: "1",
  alignSelf: "flex-start",
  justifySelf: "flex-end",
});

const content = ui({
  paddingInline: "var(--card-spacing)",
});

const footer = ui({
  display: "flex",
  alignItems: "center",
  borderBottomRightRadius: "calc(var(--radius) * 1.4)",
  borderBottomLeftRadius: "calc(var(--radius) * 1.4)",
  borderTopStyle: "var(--ui-border-style)",
  borderTopWidth: "1px",
  backgroundColor: "var(--muted)",
  padding: "var(--card-spacing)",
  "@supports (color: color-mix(in lab, red, red))": {
    backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
  },
});

export type CardSize = "default" | "sm";

export interface CardProps extends UiProps {
  /**
   * The padding, the gap and the title's size, together.
   *
   * One attribute rather than three props because that is what the eight styles
   * select on: each declares `[--card-spacing:--spacing(4)]` and
   * `data-[size=sm]:[--card-spacing:--spacing(3)]` on the card itself, and
   * every part reads the token by inheritance.
   */
  size?: CardSize;
}

/**
 * ```tsx
 * <Card>
 *   <CardHeader bordered>
 *     <CardTitle>Invoices</CardTitle>
 *     <CardDescription>Everything billed this year.</CardDescription>
 *     <CardAction><Button size="sm">New</Button></CardAction>
 *   </CardHeader>
 *   <CardContent>…</CardContent>
 *   <CardFooter>…</CardFooter>
 * </Card>
 * ```
 */
export function Card(props: Incoming<CardProps>) {
  return (
    <div {...uiProps("card", card, props)} data-size={props.size?.() ?? "default"}>
      {props.children}
    </div>
  );
}

export interface CardEdgeProps extends UiProps {
  /**
   * A rule between this and the card's body, with the padding that goes with
   * it.
   *
   * shadcn asks for the border class and keys the padding off it
   * (`[.border-b]:pb-(--card-spacing)`). There are no utility classes to key
   * off here, so it is a prop — which is also the thing the CSS was standing in
   * for.
   */
  bordered?: boolean;
}

export function CardHeader(props: Incoming<CardEdgeProps>) {
  // A literal alongside the atoms. The styles ask for the padding as
  // `[.border-b]:pb-(--card-spacing)`, which compiles to `&:is(.border-b)`, so
  // without the class a bordered header had a rule under every style and no
  // padding to go with it. A ternary rather than two conditional arguments,
  // because the compiler folds a call whose arguments are all constants and
  // two independent conditions would leave the merge on the runtime.
  const className = (): string =>
    props.bordered?.() === true ? ui(header, headerBordered, "border-b") : ui(header);
  return <div {...uiProps("card-header", className, props)}>{props.children}</div>;
}

export function CardTitle(props: Incoming<UiProps>) {
  return <div {...uiProps("card-title", title, props)}>{props.children}</div>;
}

export function CardDescription(props: Incoming<UiProps>) {
  return <div {...uiProps("card-description", description, props)}>{props.children}</div>;
}

/** The control in a header's top-right corner: the grid puts it there. */
export function CardAction(props: Incoming<UiProps>) {
  return <div {...uiProps("card-action", action, props)}>{props.children}</div>;
}

export function CardContent(props: Incoming<UiProps>) {
  return <div {...uiProps("card-content", content, props)}>{props.children}</div>;
}

/** The rule above it and the muted fill are upstream's, not a `bordered` prop. */
export function CardFooter(props: Incoming<UiProps>) {
  return <div {...uiProps("card-footer", footer, props)}>{props.children}</div>;
}
