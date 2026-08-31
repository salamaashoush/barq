import { Button as AriaButton, type ButtonComponentProps } from "@barqjs/aria/button";
import type { Incoming } from "@barqjs/core";
import { clsx, css, variants } from "@barqjs/css";

import "../theme/layers.ts";

export type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";

export type ButtonSize =
  | "default"
  | "xs"
  | "sm"
  | "lg"
  | "icon"
  | "icon-xs"
  | "icon-sm"
  | "icon-lg";

/**
 * The classes, without the component.
 *
 * shadcn reaches for Radix's `Slot` and `asChild` when a button has to be an
 * `<a>`; this hands the classes over instead, which needs no runtime and no
 * cloning of anyone's element:
 *
 * ```tsx
 * <a href="/pricing" class={buttonVariants({ variant: "outline" })}>Pricing</a>
 * ```
 */
export const buttonVariants = variants({
  base: css`
    @layer barq.ui {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      gap: calc(var(--spacing) * 2);
      border-radius: calc(var(--radius) - 2px);
      font-size: var(--text-sm);
      line-height: var(--ui-leading, var(--text-sm--line-height));
      --ui-font-weight: var(--font-weight-medium);
      font-weight: var(--font-weight-medium);
      white-space: nowrap;
      transition-property: all;
      transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
      transition-duration: var(--ui-duration, var(--default-transition-duration));
      --ui-outline-style: none;
      outline-style: none;
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
          background-color: var(--primary);
          color: var(--primary-foreground);
          @media (hover: hover) {
            &:hover {
              background-color: var(--primary);
            }
            @supports (color: color-mix(in lab, red, red)) {
              &:hover {
                background-color: color-mix(in oklab, var(--primary) 90%, transparent);
              }
            }
          }
        }
      `,
      destructive: css`
        @layer barq.ui {
          background-color: var(--destructive);
          color: var(--color-white);
          @media (hover: hover) {
            &:hover {
              background-color: var(--destructive);
            }
            @supports (color: color-mix(in lab, red, red)) {
              &:hover {
                background-color: color-mix(in oklab, var(--destructive) 90%, transparent);
              }
            }
          }
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
        }
      `,
      outline: css`
        @layer barq.ui {
          border-style: var(--ui-border-style);
          border-width: 1px;
          background-color: var(--background);
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
          &:is(.dark *) {
            border-color: var(--input);
            background-color: var(--input);
            @supports (color: color-mix(in lab, red, red)) {
              background-color: color-mix(in oklab, var(--input) 30%, transparent);
            }
          }
          @media (hover: hover) {
            &:is(.dark *):hover {
              background-color: var(--input);
            }
            @supports (color: color-mix(in lab, red, red)) {
              &:is(.dark *):hover {
                background-color: color-mix(in oklab, var(--input) 50%, transparent);
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
            &:hover {
              background-color: var(--secondary);
            }
            @supports (color: color-mix(in lab, red, red)) {
              &:hover {
                background-color: color-mix(in oklab, var(--secondary) 80%, transparent);
              }
            }
          }
        }
      `,
      ghost: css`
        @layer barq.ui {
          @media (hover: hover) {
            &:hover {
              background-color: var(--accent);
              color: var(--accent-foreground);
            }
            &:is(.dark *):hover {
              background-color: var(--accent);
            }
            @supports (color: color-mix(in lab, red, red)) {
              &:is(.dark *):hover {
                background-color: color-mix(in oklab, var(--accent) 50%, transparent);
              }
            }
          }
        }
      `,
      link: css`
        @layer barq.ui {
          color: var(--primary);
          text-underline-offset: 4px;
          @media (hover: hover) {
            &:hover {
              text-decoration-line: underline;
            }
          }
        }
      `,
    },
    size: {
      default: css`
        @layer barq.ui {
          height: calc(var(--spacing) * 9);
          padding-inline: calc(var(--spacing) * 4);
          padding-block: calc(var(--spacing) * 2);
          &:has(> svg) {
            padding-inline: calc(var(--spacing) * 3);
          }
        }
      `,
      xs: css`
        @layer barq.ui {
          height: calc(var(--spacing) * 6);
          gap: var(--spacing);
          border-radius: calc(var(--radius) - 2px);
          padding-inline: calc(var(--spacing) * 2);
          font-size: var(--text-xs);
          line-height: var(--ui-leading, var(--text-xs--line-height));
          &:has(> svg) {
            padding-inline: calc(var(--spacing) * 1.5);
          }
          & svg:not([class*="size-"]) {
            width: calc(var(--spacing) * 3);
            height: calc(var(--spacing) * 3);
          }
        }
      `,
      sm: css`
        @layer barq.ui {
          height: calc(var(--spacing) * 8);
          gap: calc(var(--spacing) * 1.5);
          border-radius: calc(var(--radius) - 2px);
          padding-inline: calc(var(--spacing) * 3);
          &:has(> svg) {
            padding-inline: calc(var(--spacing) * 2.5);
          }
        }
      `,
      lg: css`
        @layer barq.ui {
          height: calc(var(--spacing) * 10);
          border-radius: calc(var(--radius) - 2px);
          padding-inline: calc(var(--spacing) * 6);
          &:has(> svg) {
            padding-inline: calc(var(--spacing) * 4);
          }
        }
      `,
      icon: css`
        @layer barq.ui {
          width: calc(var(--spacing) * 9);
          height: calc(var(--spacing) * 9);
        }
      `,
      "icon-xs": css`
        @layer barq.ui {
          width: calc(var(--spacing) * 6);
          height: calc(var(--spacing) * 6);
          border-radius: calc(var(--radius) - 2px);
          & svg:not([class*="size-"]) {
            width: calc(var(--spacing) * 3);
            height: calc(var(--spacing) * 3);
          }
        }
      `,
      "icon-sm": css`
        @layer barq.ui {
          width: calc(var(--spacing) * 8);
          height: calc(var(--spacing) * 8);
        }
      `,
      "icon-lg": css`
        @layer barq.ui {
          width: calc(var(--spacing) * 10);
          height: calc(var(--spacing) * 10);
        }
      `,
    },
  },
  defaults: { variant: "default", size: "default" },
});

export interface ButtonProps extends ButtonComponentProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renames the slot, for a wrapper that is a button and answers to another name. */
  "data-slot"?: string;
}

/**
 * ```tsx
 * <Button variant="outline" size="sm" onPress={() => save()}>Save</Button>
 * ```
 *
 * The press comes from `@barqjs/aria`, so it begins on pointer-down, cancels
 * when the pointer leaves, and does not wait for a click on touch.
 */
export function Button(props: Incoming<ButtonProps>) {
  return (
    <AriaButton
      {...props}
      data-slot={props["data-slot"]?.() ?? "button"}
      data-variant={props.variant?.() ?? "default"}
      data-size={props.size?.() ?? "default"}
      class={clsx(
        buttonVariants({ variant: props.variant?.(), size: props.size?.() }),
        props.class?.(),
        props.className?.(),
      )}
    />
  );
}
