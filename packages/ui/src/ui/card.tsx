import type { Incoming } from "@barqjs/core";
import { clsx, css } from "@barqjs/css";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const card = css`
  @layer barq.ui {
    display: flex;
    flex-direction: column;
    gap: calc(var(--spacing) * 6);
    border-radius: calc(var(--radius) + 4px);
    border-style: var(--ui-border-style);
    border-width: 1px;
    background-color: var(--card);
    padding-block: calc(var(--spacing) * 6);
    color: var(--card-foreground);
    --ui-shadow:
      0 1px 3px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.1)),
      0 1px 2px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1));
    box-shadow:
      var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
      var(--ui-ring-shadow), var(--ui-shadow);
  }
`;

const header = css`
  @layer barq.ui {
    container-type: inline-size;
    container-name: card-header;
    display: grid;
    grid-auto-rows: min-content;
    grid-template-rows: auto auto;
    align-items: flex-start;
    gap: calc(var(--spacing) * 2);
    padding-inline: calc(var(--spacing) * 6);
    &:has([data-slot="card-action"]) {
      grid-template-columns: 1fr auto;
    }
  }
`;

const headerBordered = css`
  @layer barq.ui {
    border-bottom-style: var(--ui-border-style);
    border-bottom-width: 1px;
    padding-bottom: calc(var(--spacing) * 6);
  }
`;

const title = css`
  @layer barq.ui {
    --ui-leading: 1;
    line-height: 1;
    --ui-font-weight: var(--font-weight-semibold);
    font-weight: var(--font-weight-semibold);
  }
`;

const description = css`
  @layer barq.ui {
    font-size: var(--text-sm);
    line-height: var(--ui-leading, var(--text-sm--line-height));
    color: var(--muted-foreground);
  }
`;

const action = css`
  @layer barq.ui {
    grid-column-start: 2;
    grid-row: span 2 / span 2;
    grid-row-start: 1;
    align-self: flex-start;
    justify-self: flex-end;
  }
`;

const content = css`
  @layer barq.ui {
    padding-inline: calc(var(--spacing) * 6);
  }
`;

const footer = css`
  @layer barq.ui {
    display: flex;
    align-items: center;
    padding-inline: calc(var(--spacing) * 6);
  }
`;

const footerBordered = css`
  @layer barq.ui {
    border-top-style: var(--ui-border-style);
    border-top-width: 1px;
    padding-top: calc(var(--spacing) * 6);
  }
`;

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
  const className = (): string => clsx(header, props.bordered?.() === true && headerBordered);
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
  const className = (): string => clsx(footer, props.bordered?.() === true && footerBordered);
  return <div {...uiProps("card-footer", className, props)}>{props.children}</div>;
}
