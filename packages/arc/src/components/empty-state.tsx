import { type Child, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@barqjs/ui/empty";
import type { UiProps } from "@barqjs/ui/props";

import { arcLayer as arc } from "../layer.ts";

export type EmptyStateVariant = "plain" | "outline";

export const emptyStateVariants = variants({
  base: arc({}),
  variants: {
    variant: {
      plain: arc({}),
      outline: arc({
        borderWidth: "1px",
        borderColor: "var(--border)",
      }),
    },
  },
  defaults: { variant: "plain" },
});

const actions = arc({
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "calc(var(--spacing) * 2)",
});

export interface EmptyStateProps extends UiProps {
  /** What would be here, drawn in a muted square: `<Inbox />`. */
  icon?: Child;
  /** Not `title`, which is the attribute every element takes. */
  heading: Child;
  description?: Child;
  /** What fills it: one button, or a few. */
  actions?: Child;
  /** `outline` draws the dashed frame, for an empty area on a plain page. @default "plain" */
  variant?: EmptyStateVariant;
}

/**
 * A list or an area with nothing in it yet, and what to do about that.
 *
 * ```tsx
 * <EmptyState
 *   icon={<Inbox />}
 *   heading="No invoices yet"
 *   description="They appear here once one is sent."
 *   actions={<Button onPress={create}>New invoice</Button>}
 * />
 * ```
 */
export function EmptyState(props: EmptyStateProps) {
  return (
    <Empty
      {...props}
      data-slot={props["data-slot"] ?? "empty-state"}
      data-variant={props.variant ?? "plain"}
      class={arc(emptyStateVariants({ variant: props.variant }), props.class, props.className)}
    >
      <EmptyHeader>
        <Show when={props.icon}>
          <EmptyMedia variant="icon">{props.icon}</EmptyMedia>
        </Show>
        <EmptyTitle>{props.heading}</EmptyTitle>
        <Show when={props.description}>
          <EmptyDescription>{props.description}</EmptyDescription>
        </Show>
      </EmptyHeader>
      <Show when={props.actions}>
        <EmptyContent class={actions}>{props.actions}</EmptyContent>
      </Show>
    </Empty>
  );
}
