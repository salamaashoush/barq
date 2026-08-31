import type { Incoming } from "@barqjs/core";
import { css, variants } from "@barqjs/css";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

export type AlertVariant = "default" | "destructive";

export const alertVariants = variants({
  base: css`
    @layer barq.ui {
      position: relative;
      display: grid;
      width: 100%;
      grid-template-columns: 0 1fr;
      align-items: flex-start;
      row-gap: calc(var(--spacing) * 0.5);
      border-radius: var(--radius);
      border-style: var(--ui-border-style);
      border-width: 1px;
      padding-inline: calc(var(--spacing) * 4);
      padding-block: calc(var(--spacing) * 3);
      font-size: var(--text-sm);
      line-height: var(--ui-leading, var(--text-sm--line-height));
      &:has(> svg) {
        grid-template-columns: calc(var(--spacing) * 4) 1fr;
        column-gap: calc(var(--spacing) * 3);
      }
      & > svg {
        width: calc(var(--spacing) * 4);
        height: calc(var(--spacing) * 4);
        --ui-translate-y: calc(var(--spacing) * 0.5);
        translate: var(--ui-translate-x) var(--ui-translate-y);
        color: currentcolor;
      }
    }
  `,
  variants: {
    variant: {
      default: css`
        @layer barq.ui {
          background-color: var(--card);
          color: var(--card-foreground);
        }
      `,
      destructive: css`
        @layer barq.ui {
          background-color: var(--card);
          color: var(--destructive);
          :is(& > *)[data-slot="alert-description"] {
            color: var(--destructive);
            @supports (color: color-mix(in lab, red, red)) {
              color: color-mix(in oklab, var(--destructive) 90%, transparent);
            }
          }
          & > svg {
            color: currentcolor;
          }
        }
      `,
    },
  },
  defaults: { variant: "default" },
});

const title = css`
  @layer barq.ui {
    grid-column-start: 2;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    min-height: calc(var(--spacing) * 4);
    --ui-font-weight: var(--font-weight-medium);
    font-weight: var(--font-weight-medium);
    --ui-tracking: var(--tracking-tight);
    letter-spacing: var(--tracking-tight);
  }
`;

const description = css`
  @layer barq.ui {
    grid-column-start: 2;
    display: grid;
    justify-items: start;
    gap: var(--spacing);
    font-size: var(--text-sm);
    line-height: var(--ui-leading, var(--text-sm--line-height));
    color: var(--muted-foreground);
    & p {
      --ui-leading: var(--leading-relaxed);
      line-height: var(--leading-relaxed);
    }
  }
`;

export interface AlertProps extends UiProps {
  variant?: AlertVariant;
}

/**
 * ```tsx
 * <Alert variant="destructive">
 *   <TriangleAlert />
 *   <AlertTitle>Payment failed</AlertTitle>
 *   <AlertDescription>The card was declined.</AlertDescription>
 * </Alert>
 * ```
 *
 * An icon is an ordinary child. The grid finds it with `:has(> svg)` and opens
 * a column for it, so there is no slot to remember and no prop to set.
 */
export function Alert(props: Incoming<AlertProps>) {
  const className = (): string => alertVariants({ variant: props.variant?.() });
  return (
    <div
      {...uiProps("alert", className, props)}
      role={props.role?.() ?? "alert"}
      data-variant={props.variant?.() ?? "default"}
    >
      {props.children}
    </div>
  );
}

export function AlertTitle(props: Incoming<UiProps>) {
  return <div {...uiProps("alert-title", title, props)}>{props.children}</div>;
}

export function AlertDescription(props: Incoming<UiProps>) {
  return <div {...uiProps("alert-description", description, props)}>{props.children}</div>;
}
