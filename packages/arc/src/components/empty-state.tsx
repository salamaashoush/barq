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
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, gap, layout } from "../style/index.ts";

export type EmptyStateVariant = "plain" | "outline";

export const emptyStateVariants = variants({
  slots: {
    root: arc({}),
    header: arc({}),
    media: arc({}),
    title: arc({}),
    description: arc({}),
    actions: arc(layout.wrap, layout.centre, gap[2], { flexDirection: "row" }),
  },
  variants: {
    variant: {
      plain: {},
      outline: { root: arc(edge.frame) },
    },
  },
  defaults: { variant: "plain" },
});

type Slots = ReturnType<typeof emptyStateVariants>;

export interface EmptyStateProps extends Omit<UiProps, "class" | "className">, Customisable<Slots> {
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
  const cls = (): Slots => parts(emptyStateVariants({ variant: props.variant }), props.classes);
  return (
    <Empty
      {...props}
      data-slot={props["data-slot"] ?? "empty-state"}
      data-variant={props.variant ?? "plain"}
      class={arc(cls().root, props.class, props.className)}
    >
      <EmptyHeader class={cls().header}>
        <Show when={props.icon}>
          <EmptyMedia variant="icon" class={cls().media}>
            {props.icon}
          </EmptyMedia>
        </Show>
        <EmptyTitle class={cls().title}>{props.heading}</EmptyTitle>
        <Show when={props.description}>
          <EmptyDescription class={cls().description}>{props.description}</EmptyDescription>
        </Show>
      </EmptyHeader>
      <Show when={props.actions}>
        <EmptyContent class={cls().actions}>{props.actions}</EmptyContent>
      </Show>
    </Empty>
  );
}
