import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

const card = ui({
  display: "flex",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 6)",
  borderRadius: "calc(var(--radius) + 4px)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  backgroundColor: "var(--card)",
  paddingBlock: "calc(var(--spacing) * 6)",
  color: "var(--card-foreground)",
  "--ui-shadow":
    "0 1px 3px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 1px 2px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
});

const header = ui({
  containerType: "inline-size",
  containerName: "card-header",
  display: "grid",
  gridAutoRows: "min-content",
  gridTemplateRows: "auto auto",
  alignItems: "flex-start",
  gap: "calc(var(--spacing) * 2)",
  paddingInline: "calc(var(--spacing) * 6)",
  ':has([data-slot="card-action"])': {
    gridTemplateColumns: "1fr auto",
  },
});

const headerBordered = ui({
  borderBottomStyle: "var(--ui-border-style)",
  borderBottomWidth: "1px",
  paddingBottom: "calc(var(--spacing) * 6)",
});

const title = ui({
  "--ui-leading": "1",
  lineHeight: "1",
  "--ui-font-weight": "var(--font-weight-semibold)",
  fontWeight: "var(--font-weight-semibold)",
});

const description = ui({
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
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
  paddingInline: "calc(var(--spacing) * 6)",
});

const footer = ui({
  display: "flex",
  alignItems: "center",
  paddingInline: "calc(var(--spacing) * 6)",
});

const footerBordered = ui({
  borderTopStyle: "var(--ui-border-style)",
  borderTopWidth: "1px",
  paddingTop: "calc(var(--spacing) * 6)",
});

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
export function Card(props: Incoming<UiProps>) {
  return <div {...uiProps("card", card, props)}>{props.children}</div>;
}

export interface CardEdgeProps extends UiProps {
  /**
   * A rule between this and the card's body, with the padding that goes with
   * it.
   *
   * shadcn asks for the border class and keys the padding off it
   * (`[.border-b]:pb-6`). There are no utility classes to key off here, so it
   * is a prop — which is also the thing the CSS was standing in for.
   */
  bordered?: boolean;
}

export function CardHeader(props: Incoming<CardEdgeProps>) {
  const className = (): string => ui(header, props.bordered?.() === true && headerBordered);
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

export function CardFooter(props: Incoming<CardEdgeProps>) {
  const className = (): string => ui(footer, props.bordered?.() === true && footerBordered);
  return <div {...uiProps("card-footer", className, props)}>{props.children}</div>;
}
