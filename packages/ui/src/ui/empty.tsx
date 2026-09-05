import type { Incoming } from "@barqjs/core";
import { firstThatWorks, layer, variants } from "@barqjs/css";

import "../theme/layers.ts";
import { icon } from "../lib/shared-icon.ts";
import { text } from "../lib/shared-text.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const ui = layer("barq.ui");

const root = ui({
  display: "flex",
  width: "100%",
  minWidth: "0px",
  flex: "1",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "calc(var(--spacing) * 4)",
  borderRadius: "calc(var(--radius) * 1.4)",
  borderStyle: firstThatWorks("dashed", "var(--ui-border-style)"),
  "--ui-border-style": "dashed",
  padding: "calc(var(--spacing) * 6)",
  textAlign: "center",
  textWrap: "balance",
});

const header = ui({
  display: "flex",
  maxWidth: "var(--container-sm)",
  flexDirection: "column",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  textAlign: "center",
});

const title = ui(text.medium, text.heading, text.sm, {
  "--ui-tracking": "var(--tracking-tight)",
  letterSpacing: "var(--tracking-tight)",
});

const description = ui({
  fontSize: "var(--text-sm)",
  lineHeight: "var(--leading-relaxed)",
  color: "var(--muted-foreground)",
  "& > a": {
    textDecorationLine: "underline",
    textUnderlineOffset: "4px",
  },
  "& > a:hover": {
    color: "var(--primary)",
  },
});

const content = ui(text.sm, {
  display: "flex",
  width: "100%",
  maxWidth: "var(--container-sm)",
  minWidth: "0px",
  flexDirection: "column",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2.5)",
  textWrap: "balance",
});

export type EmptyMediaVariant = "default" | "icon";

export const emptyMediaVariants = variants({
  base: ui(icon.plain, {
    marginBottom: "calc(var(--spacing) * 2)",
    display: "flex",
    flexShrink: "0",
    alignItems: "center",
    justifyContent: "center",
  }),
  variants: {
    variant: {
      default: ui({
        backgroundColor: "transparent",
      }),
      icon: ui({
        display: "flex",
        width: "calc(var(--spacing) * 8)",
        height: "calc(var(--spacing) * 8)",
        flexShrink: "0",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius)",
        backgroundColor: "var(--muted)",
        color: "var(--foreground)",
        '& svg:not([class*="size-"])': {
          width: "calc(var(--spacing) * 4)",
          height: "calc(var(--spacing) * 4)",
        },
      }),
    },
  },
  defaults: { variant: "default" },
});

/**
 * ```tsx
 * <Empty>
 *   <EmptyHeader>
 *     <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
 *     <EmptyTitle>No invoices yet</EmptyTitle>
 *     <EmptyDescription>They will appear here once you send one.</EmptyDescription>
 *   </EmptyHeader>
 *   <EmptyContent><Button>New invoice</Button></EmptyContent>
 * </Empty>
 * ```
 */
export function Empty(props: Incoming<UiProps>) {
  return <div {...uiProps("empty", root, props)}>{props.children}</div>;
}

export function EmptyHeader(props: Incoming<UiProps>) {
  return <div {...uiProps("empty-header", header, props)}>{props.children}</div>;
}

export interface EmptyMediaProps extends UiProps {
  /** `icon` puts it in a rounded muted square. @default "default" */
  variant?: EmptyMediaVariant;
}

export function EmptyMedia(props: Incoming<EmptyMediaProps>) {
  const className = (): string => emptyMediaVariants({ variant: props.variant?.() });
  return (
    <div
      {...uiProps("empty-media", className, props)}
      data-variant={props.variant?.() ?? "default"}
    >
      {props.children}
    </div>
  );
}

export function EmptyTitle(props: Incoming<UiProps>) {
  return <div {...uiProps("empty-title", title, props)}>{props.children}</div>;
}

export function EmptyDescription(props: Incoming<UiProps>) {
  return <div {...uiProps("empty-description", description, props)}>{props.children}</div>;
}

export function EmptyContent(props: Incoming<UiProps>) {
  return <div {...uiProps("empty-content", content, props)}>{props.children}</div>;
}
