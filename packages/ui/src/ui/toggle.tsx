import {
  ToggleButton as AriaToggleButton,
  type ToggleButtonComponentProps,
} from "@barqjs/aria/button";
import type { Incoming } from "@barqjs/core";
import { clsx, css, variants } from "@barqjs/css";

import "../theme/layers.ts";

export type ToggleVariant = "default" | "outline";
export type ToggleSize = "default" | "sm" | "lg";

export const toggleVariants = variants({
  base: css`
    @layer barq.ui {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: calc(var(--spacing) * 2);
      border-radius: calc(var(--radius) - 2px);
      font-size: var(--text-sm);
      line-height: var(--ui-leading, var(--text-sm--line-height));
      --ui-font-weight: var(--font-weight-medium);
      font-weight: var(--font-weight-medium);
      white-space: nowrap;
      transition-property: color, box-shadow;
      transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
      transition-duration: var(--ui-duration, var(--default-transition-duration));
      --ui-outline-style: none;
      outline-style: none;
      @media (hover: hover) {
        &:hover {
          background-color: var(--muted);
          color: var(--muted-foreground);
        }
      }
      &:disabled {
        pointer-events: none;
        opacity: 50%;
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
      &[data-selected] {
        background-color: var(--accent);
        color: var(--accent-foreground);
      }
      &[data-focus-visible] {
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
      & svg {
        pointer-events: none;
        flex-shrink: 0;
      }
      & svg:not([class*="size-"]) {
        width: calc(var(--spacing) * 4);
        height: calc(var(--spacing) * 4);
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
      outline: css`
        @layer barq.ui {
          border-style: var(--ui-border-style);
          border-width: 1px;
          border-color: var(--input);
          background-color: transparent;
          --ui-shadow: 0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05));
          box-shadow:
            var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
            var(--ui-ring-shadow), var(--ui-shadow);
          @media (hover: hover) {
            &:hover {
              background-color: var(--accent);
              color: var(--accent-foreground);
            }
          }
        }
      `,
    },
    size: {
      default: css`
        @layer barq.ui {
          height: calc(var(--spacing) * 9);
          min-width: calc(var(--spacing) * 9);
          padding-inline: calc(var(--spacing) * 2);
        }
      `,
      sm: css`
        @layer barq.ui {
          height: calc(var(--spacing) * 8);
          min-width: calc(var(--spacing) * 8);
          padding-inline: calc(var(--spacing) * 1.5);
        }
      `,
      lg: css`
        @layer barq.ui {
          height: calc(var(--spacing) * 10);
          min-width: calc(var(--spacing) * 10);
          padding-inline: calc(var(--spacing) * 2.5);
        }
      `,
    },
  },
  defaults: { variant: "default", size: "default" },
});

export interface ToggleProps extends ToggleButtonComponentProps {
  variant?: ToggleVariant;
  size?: ToggleSize;
}

/**
 * ```tsx
 * <Toggle aria-label="Bold" onChange={(on) => setBold(on)}><Bold /></Toggle>
 * ```
 *
 * `aria-pressed`, not a class: the pressed state is announced, and
 * `data-selected` is what the CSS reads.
 */
export function Toggle(props: Incoming<ToggleProps>) {
  return (
    <AriaToggleButton
      {...props}
      data-slot={props["data-slot"]?.() ?? "toggle"}
      data-variant={props.variant?.() ?? "default"}
      data-size={props.size?.() ?? "default"}
      class={clsx(
        toggleVariants({ variant: props.variant?.(), size: props.size?.() }),
        props.class?.(),
        props.className?.(),
      )}
    />
  );
}
