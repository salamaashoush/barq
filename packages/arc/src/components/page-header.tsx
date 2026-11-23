import { type Child, Show, cells } from "@barqjs/core";
import type { UiProps } from "@barqjs/ui/props";
import { uiProps } from "@barqjs/ui/slot";

import { arcLayer as arc } from "../layer.ts";

const root = arc({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: "calc(var(--spacing) * 4)",
  paddingBlockEnd: "calc(var(--spacing) * 4)",
});

const text = arc({
  display: "flex",
  minWidth: "0px",
  flex: "1 1 18rem",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 1)",
});

const heading = arc({
  margin: "0",
  fontFamily: "var(--font-heading, var(--font-sans))",
  fontSize: "var(--text-2xl)",
  lineHeight: "var(--text-2xl--line-height)",
  fontWeight: "var(--font-weight-semibold)",
  letterSpacing: "var(--tracking-tight)",
  textWrap: "balance",
});

const description = arc({
  margin: "0",
  color: "var(--muted-foreground)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--text-sm--line-height)",
  textWrap: "pretty",
});

const actions = arc({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
});

export interface PageHeaderProps extends UiProps {
  /** The page's `<h1>`. Not `title`, which is the attribute every element takes. */
  heading: Child;
  description?: Child;
  /** Above the title: a breadcrumb, a back link, an eyebrow. */
  leading?: Child;
  /** At the end of the row, wrapping below the title on a narrow screen. */
  actions?: Child;
}

/**
 * The top of a page: what it is, a line about it, and what you can do here.
 *
 * ```tsx
 * <PageHeader
 *   heading="Checks"
 *   description="Everything this project watches."
 *   actions={<Button onPress={create}>New check</Button>}
 * />
 * ```
 */
export function PageHeader(props: PageHeaderProps) {
  return (
    <header {...uiProps("page-header", root, cells(props))}>
      <div class={text} data-slot="page-header-text">
        <Show when={props.leading}>{props.leading}</Show>
        <h1 class={heading} data-slot="page-header-title">
          {props.heading}
        </h1>
        <Show when={props.description}>
          <p class={description} data-slot="page-header-description">
            {props.description}
          </p>
        </Show>
      </div>
      <Show when={props.actions}>
        <div class={actions} data-slot="page-header-actions">
          {props.actions}
        </div>
      </Show>
    </header>
  );
}
