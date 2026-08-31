import type { Incoming } from "@barqjs/core";
import { css, variants } from "@barqjs/css";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const root = css`
  @layer barq.ui {
    display: flex;
    min-width: 0px;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: calc(var(--spacing) * 6);
    border-radius: var(--radius);
    border-style: var(--ui-border-style);
    border-width: 1px;
    --ui-border-style: dashed;
    border-style: dashed;
    padding: calc(var(--spacing) * 6);
    text-align: center;
    text-wrap: balance;
    @media (width >= 48rem) {
      & {
        padding: calc(var(--spacing) * 12);
      }
    }
  }
`;

const header = css`
  @layer barq.ui {
    display: flex;
    max-width: var(--container-sm);
    flex-direction: column;
    align-items: center;
    gap: calc(var(--spacing) * 2);
    text-align: center;
  }
`;

const title = css`
  @layer barq.ui {
    font-size: var(--text-lg);
    line-height: var(--ui-leading, var(--text-lg--line-height));
    --ui-font-weight: var(--font-weight-medium);
    font-weight: var(--font-weight-medium);
    --ui-tracking: var(--tracking-tight);
    letter-spacing: var(--tracking-tight);
  }
`;

const description = css`
  @layer barq.ui {
    font-size: var(--text-sm);
    line-height: var(--leading-relaxed);
    color: var(--muted-foreground);
    & > a {
      text-decoration-line: underline;
      text-underline-offset: 4px;
    }
    & > a:hover {
      color: var(--primary);
    }
  }
`;

const content = css`
  @layer barq.ui {
    display: flex;
    width: 100%;
    max-width: var(--container-sm);
    min-width: 0px;
    flex-direction: column;
    align-items: center;
    gap: calc(var(--spacing) * 4);
    font-size: var(--text-sm);
    line-height: var(--ui-leading, var(--text-sm--line-height));
    text-wrap: balance;
  }
`;

export type EmptyMediaVariant = "default" | "icon";

export const emptyMediaVariants = variants({
  base: css`
    @layer barq.ui {
      margin-bottom: calc(var(--spacing) * 2);
      display: flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      & svg {
        pointer-events: none;
        flex-shrink: 0;
      }
    }
  `,
  variants: {
    variant: {
      default: css`
        @layer barq.ui {
          background-color: transparent;
        }
      `,
      icon: css`
        @layer barq.ui {
          display: flex;
          width: calc(var(--spacing) * 10);
          height: calc(var(--spacing) * 10);
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius);
          background-color: var(--muted);
          color: var(--foreground);
          & svg:not([class*="size-"]) {
            width: calc(var(--spacing) * 6);
            height: calc(var(--spacing) * 6);
          }
        }
      `,
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
