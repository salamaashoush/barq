import type { Incoming } from "@barqjs/core";
import { clsx, css, variants } from "@barqjs/css";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";
import { Separator, type SeparatorProps } from "./separator.tsx";

export type ButtonGroupOrientation = "horizontal" | "vertical";

export const buttonGroupVariants = variants({
  base: css`
    @layer barq.ui {
      display: flex;
      width: fit-content;
      align-items: stretch;
      &:has(> [data-slot="button-group"]) {
        gap: calc(var(--spacing) * 2);
      }
      & > *:focus-visible {
        position: relative;
        z-index: 10;
      }
      &:has(> select[aria-hidden="true"]:last-child) > [data-slot="select-trigger"]:last-of-type {
        border-top-right-radius: calc(var(--radius) - 2px);
        border-bottom-right-radius: calc(var(--radius) - 2px);
      }
      & > [data-slot="select-trigger"]:not([class*="w-"]) {
        width: fit-content;
      }
      & > input {
        flex: 1;
      }
    }
  `,
  variants: {
    orientation: {
      horizontal: css`
        @layer barq.ui {
          & > :not(:first-child) {
            border-top-left-radius: 0;
            border-bottom-left-radius: 0;
            border-left-style: var(--ui-border-style);
            border-left-width: 0px;
          }
          & > :not(:last-child) {
            border-top-right-radius: 0;
            border-bottom-right-radius: 0;
          }
        }
      `,
      vertical: css`
        @layer barq.ui {
          flex-direction: column;
          & > :not(:first-child) {
            border-top-left-radius: 0;
            border-top-right-radius: 0;
            border-top-style: var(--ui-border-style);
            border-top-width: 0px;
          }
          & > :not(:last-child) {
            border-bottom-right-radius: 0;
            border-bottom-left-radius: 0;
          }
        }
      `,
    },
  },
  defaults: { orientation: "horizontal" },
});

const text = css`
  @layer barq.ui {
    display: flex;
    align-items: center;
    gap: calc(var(--spacing) * 2);
    border-radius: calc(var(--radius) - 2px);
    border-style: var(--ui-border-style);
    border-width: 1px;
    background-color: var(--muted);
    padding-inline: calc(var(--spacing) * 4);
    font-size: var(--text-sm);
    line-height: var(--ui-leading, var(--text-sm--line-height));
    --ui-font-weight: var(--font-weight-medium);
    font-weight: var(--font-weight-medium);
    --ui-shadow: 0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05));
    box-shadow:
      var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
      var(--ui-ring-shadow), var(--ui-shadow);
    & svg {
      pointer-events: none;
    }
    & svg:not([class*="size-"]) {
      width: calc(var(--spacing) * 4);
      height: calc(var(--spacing) * 4);
    }
  }
`;

const separator = css`
  @layer barq.ui {
    position: relative;
    margin: 0px !important;
    align-self: stretch;
    background-color: var(--input);
    &[data-orientation="vertical"] {
      height: auto;
    }
  }
`;

export interface ButtonGroupProps extends UiProps {
  /** @default "horizontal" */
  orientation?: ButtonGroupOrientation;
}

/**
 * Buttons welded into one control: the inner corners are squared and the
 * shared borders collapse.
 *
 * ```tsx
 * <ButtonGroup>
 *   <Button variant="outline">Day</Button>
 *   <Button variant="outline">Week</Button>
 *   <Button variant="outline">Month</Button>
 * </ButtonGroup>
 * ```
 *
 * The rules select `& > *`, so anything with a border joins the seam: a
 * `<Button>`, a `<ButtonGroupText>`, a `<Select>`'s trigger, an `<Input>`.
 */
export function ButtonGroup(props: Incoming<ButtonGroupProps>) {
  const className = (): string => buttonGroupVariants({ orientation: props.orientation?.() });
  return (
    <div
      {...uiProps("button-group", className, props)}
      role={props.role?.() ?? "group"}
      data-orientation={props.orientation?.() ?? "horizontal"}
    >
      {props.children}
    </div>
  );
}

/** A label welded into the group: a unit, a prefix, an icon that is not a button. */
export function ButtonGroupText(props: Incoming<UiProps>) {
  return <div {...uiProps("button-group-text", text, props)}>{props.children}</div>;
}

export interface ButtonGroupSeparatorProps extends SeparatorProps {}

/** The line between two segments. Vertical by default, which is what a row of buttons wants. */
export function ButtonGroupSeparator(props: Incoming<ButtonGroupSeparatorProps>) {
  return (
    <Separator
      {...props}
      data-slot={props["data-slot"]?.() ?? "button-group-separator"}
      orientation={props.orientation?.() ?? "vertical"}
      class={clsx(separator, props.class?.(), props.className?.())}
    />
  );
}
