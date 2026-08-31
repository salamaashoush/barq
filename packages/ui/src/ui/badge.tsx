import { Show, type Incoming } from "@barqjs/core";
import { css, variants } from "@barqjs/css";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

export type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";

/**
 * The classes, for a badge you render yourself.
 *
 * ```tsx
 * <button type="button" class={badgeVariants({ variant: "outline" })}>Draft</button>
 * ```
 */
export const badgeVariants = variants({
  base: css`
    @layer barq.ui {
      display: inline-flex;
      width: fit-content;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      gap: var(--spacing);
      overflow: hidden;
      border-radius: calc(infinity * 1px);
      border-style: var(--ui-border-style);
      border-width: 1px;
      border-color: transparent;
      padding-inline: calc(var(--spacing) * 2);
      padding-block: calc(var(--spacing) * 0.5);
      font-size: var(--text-xs);
      line-height: var(--ui-leading, var(--text-xs--line-height));
      --ui-font-weight: var(--font-weight-medium);
      font-weight: var(--font-weight-medium);
      white-space: nowrap;
      transition-property: color, box-shadow;
      transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
      transition-duration: var(--ui-duration, var(--default-transition-duration));
      &:focus-visible {
        border-color: var(--ring);
        --ui-ring-shadow: var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width))
          var(--ui-ring-color, currentcolor);
        box-shadow:
          var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
          var(--ui-ring-shadow), var(--ui-shadow);
        --ui-ring-color: var(--ring);
        @supports (color: color-mix(in lab, red, red)) {
          --ui-ring-color: color-mix(in oklab, var(--ring) 50%, transparent);
        }
      }
      &[aria-invalid="true"] {
        border-color: var(--destructive);
        --ui-ring-color: var(--destructive);
        @supports (color: color-mix(in lab, red, red)) {
          --ui-ring-color: color-mix(in oklab, var(--destructive) 20%, transparent);
        }
      }
      &:is(.dark *)[aria-invalid="true"] {
        --ui-ring-color: var(--destructive);
        @supports (color: color-mix(in lab, red, red)) {
          --ui-ring-color: color-mix(in oklab, var(--destructive) 40%, transparent);
        }
      }
      & > svg {
        pointer-events: none;
        width: calc(var(--spacing) * 3);
        height: calc(var(--spacing) * 3);
      }
    }
  `,
  variants: {
    variant: {
      default: css`
        @layer barq.ui {
          background-color: var(--primary);
          color: var(--primary-foreground);
          @media (hover: hover) {
            a&:hover {
              background-color: var(--primary);
            }
            @supports (color: color-mix(in lab, red, red)) {
              a&:hover {
                background-color: color-mix(in oklab, var(--primary) 90%, transparent);
              }
            }
          }
        }
      `,
      secondary: css`
        @layer barq.ui {
          background-color: var(--secondary);
          color: var(--secondary-foreground);
          @media (hover: hover) {
            a&:hover {
              background-color: var(--secondary);
            }
            @supports (color: color-mix(in lab, red, red)) {
              a&:hover {
                background-color: color-mix(in oklab, var(--secondary) 90%, transparent);
              }
            }
          }
        }
      `,
      destructive: css`
        @layer barq.ui {
          background-color: var(--destructive);
          color: var(--color-white);
          &:focus-visible {
            --ui-ring-color: var(--destructive);
            @supports (color: color-mix(in lab, red, red)) {
              --ui-ring-color: color-mix(in oklab, var(--destructive) 20%, transparent);
            }
          }
          &:is(.dark *) {
            background-color: var(--destructive);
            @supports (color: color-mix(in lab, red, red)) {
              background-color: color-mix(in oklab, var(--destructive) 60%, transparent);
            }
          }
          &:is(.dark *):focus-visible {
            --ui-ring-color: var(--destructive);
            @supports (color: color-mix(in lab, red, red)) {
              --ui-ring-color: color-mix(in oklab, var(--destructive) 40%, transparent);
            }
          }
          @media (hover: hover) {
            a&:hover {
              background-color: var(--destructive);
            }
            @supports (color: color-mix(in lab, red, red)) {
              a&:hover {
                background-color: color-mix(in oklab, var(--destructive) 90%, transparent);
              }
            }
          }
        }
      `,
      outline: css`
        @layer barq.ui {
          border-color: var(--border);
          color: var(--foreground);
          @media (hover: hover) {
            a&:hover {
              background-color: var(--accent);
              color: var(--accent-foreground);
            }
          }
        }
      `,
      ghost: css`
        @layer barq.ui {
          @media (hover: hover) {
            a&:hover {
              background-color: var(--accent);
              color: var(--accent-foreground);
            }
          }
        }
      `,
      link: css`
        @layer barq.ui {
          color: var(--primary);
          text-underline-offset: 4px;
          @media (hover: hover) {
            a&:hover {
              text-decoration-line: underline;
            }
          }
        }
      `,
    },
  },
  defaults: { variant: "default" },
});

export interface BadgeProps extends UiProps {
  variant?: BadgeVariant;
  /** Renders an `<a>` instead of a `<span>`. The hover styles are written for it. */
  href?: string;
  target?: string;
  rel?: string;
}

/**
 * ```tsx
 * <Badge>New</Badge>
 * <Badge variant="destructive">Overdue</Badge>
 * <Badge variant="outline" href="/tags/rust">rust</Badge>
 * ```
 */
export function Badge(props: Incoming<BadgeProps>) {
  const className = (): string => badgeVariants({ variant: props.variant?.() });
  const shared = (): Record<string, unknown> => ({
    ...uiProps("badge", className, props),
    "data-variant": props.variant?.() ?? "default",
  });

  return (
    <Show
      when={props.href?.() !== undefined}
      fallback={<span {...shared()}>{props.children}</span>}
    >
      <a {...shared()} href={props.href?.()} target={props.target?.()} rel={props.rel?.()}>
        {props.children}
      </a>
    </Show>
  );
}
