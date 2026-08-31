import type { Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const kbd = css`
  @layer barq.ui {
    pointer-events: none;
    display: inline-flex;
    height: calc(var(--spacing) * 5);
    width: fit-content;
    min-width: calc(var(--spacing) * 5);
    align-items: center;
    justify-content: center;
    gap: var(--spacing);
    border-radius: calc(var(--radius) - 4px);
    background-color: var(--muted);
    padding-inline: var(--spacing);
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    line-height: var(--ui-leading, var(--text-xs--line-height));
    --ui-font-weight: var(--font-weight-medium);
    font-weight: var(--font-weight-medium);
    color: var(--muted-foreground);
    -webkit-user-select: none;
    user-select: none;
    & svg:not([class*="size-"]) {
      width: calc(var(--spacing) * 3);
      height: calc(var(--spacing) * 3);
    }
    [data-slot="tooltip-content"] & {
      background-color: var(--background);
      @supports (color: color-mix(in lab, red, red)) {
        background-color: color-mix(in oklab, var(--background) 20%, transparent);
      }
      color: var(--background);
    }
    [data-slot="tooltip-content"] &:is(.dark *) {
      background-color: var(--background);
      @supports (color: color-mix(in lab, red, red)) {
        background-color: color-mix(in oklab, var(--background) 10%, transparent);
      }
    }
  }
`;

const group = css`
  @layer barq.ui {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing);
  }
`;

/**
 * ```tsx
 * <KbdGroup>
 *   <Kbd>⌘</Kbd>
 *   <Kbd>K</Kbd>
 * </KbdGroup>
 * ```
 */
export function Kbd(props: Incoming<UiProps>) {
  return <kbd {...uiProps("kbd", kbd, props)}>{props.children}</kbd>;
}

export function KbdGroup(props: Incoming<UiProps>) {
  return <kbd {...uiProps("kbd-group", group, props)}>{props.children}</kbd>;
}
