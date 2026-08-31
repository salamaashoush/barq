import type { Incoming } from "@barqjs/core";
import { firstThatWorks } from "@barqjs/css";

import "../theme/layers.ts";
import { ui, uiVariants } from "../lib/atoms.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const root = ui({
  display: "flex",
  minWidth: "0px",
  flex: "1",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "calc(var(--spacing) * 6)",
  borderRadius: "var(--radius)",
  borderStyle: firstThatWorks("dashed", "var(--ui-border-style)"),
  borderWidth: "1px",
  "--ui-border-style": "dashed",
  padding: "calc(var(--spacing) * 6)",
  textAlign: "center",
  textWrap: "balance",
  "@media (width >= 48rem)": {
    "&": {
      padding: "calc(var(--spacing) * 12)",
    },
  },
});

const header = ui({
  display: "flex",
  maxWidth: "var(--container-sm)",
  flexDirection: "column",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  textAlign: "center",
});

const title = ui({
  fontSize: "var(--text-lg)",
  lineHeight: "var(--ui-leading, var(--text-lg--line-height))",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
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

const content = ui({
  display: "flex",
  width: "100%",
  maxWidth: "var(--container-sm)",
  minWidth: "0px",
  flexDirection: "column",
  alignItems: "center",
  gap: "calc(var(--spacing) * 4)",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  textWrap: "balance",
});

export type EmptyMediaVariant = "default" | "icon";

export const emptyMediaVariants = uiVariants({
  base: ui({
    marginBottom: "calc(var(--spacing) * 2)",
    display: "flex",
    flexShrink: "0",
    alignItems: "center",
    justifyContent: "center",
    "& svg": {
      pointerEvents: "none",
      flexShrink: "0",
    },
  }),
  variants: {
    variant: {
      default: ui({
        backgroundColor: "transparent",
      }),
      icon: ui({
        display: "flex",
        width: "calc(var(--spacing) * 10)",
        height: "calc(var(--spacing) * 10)",
        flexShrink: "0",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius)",
        backgroundColor: "var(--muted)",
        color: "var(--foreground)",
        '& svg:not([class*="size-"])': {
          width: "calc(var(--spacing) * 6)",
          height: "calc(var(--spacing) * 6)",
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
