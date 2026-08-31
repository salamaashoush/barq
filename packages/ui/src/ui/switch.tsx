import { Switch as AriaSwitch, type SwitchComponentProps } from "@barqjs/aria/switch";
import type { Incoming } from "@barqjs/core";
import { clsx, css } from "@barqjs/css";

import "../theme/layers.ts";

const track = css`
  @layer barq.ui {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    border-radius: calc(infinity * 1px);
    border-style: var(--ui-border-style);
    border-width: 1px;
    border-color: transparent;
    --ui-shadow: 0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05));
    box-shadow:
      var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
      var(--ui-ring-shadow), var(--ui-shadow);
    transition-property: all;
    transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
    transition-duration: var(--ui-duration, var(--default-transition-duration));
    --ui-outline-style: none;
    outline-style: none;
    &[data-size="default"] {
      height: 1.15rem;
      width: calc(var(--spacing) * 8);
    }
    &[data-size="sm"] {
      height: calc(var(--spacing) * 3.5);
      width: calc(var(--spacing) * 6);
    }
    &[data-selected] {
      background-color: var(--primary);
    }
    &:not([data-selected]) {
      background-color: var(--input);
    }
    &:is(.dark *):not([data-selected]) {
      background-color: var(--input);
      @supports (color: color-mix(in lab, red, red)) {
        background-color: color-mix(in oklab, var(--input) 80%, transparent);
      }
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
    &[data-disabled] {
      cursor: not-allowed;
      opacity: 50%;
    }
  }
`;

const thumb = css`
  @layer barq.ui {
    pointer-events: none;
    display: block;
    --ui-translate-x: 0px;
    translate: var(--ui-translate-x) var(--ui-translate-y);
    border-radius: calc(infinity * 1px);
    background-color: var(--background);
    --ui-ring-shadow: var(--ui-ring-inset,) 0 0 0 calc(0px + var(--ui-ring-offset-width))
      var(--ui-ring-color, currentcolor);
    box-shadow:
      var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
      var(--ui-ring-shadow), var(--ui-shadow);
    transition-property: transform, translate, scale, rotate;
    transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
    transition-duration: var(--ui-duration, var(--default-transition-duration));
    &:is(.dark *):not([data-selected] *) {
      background-color: var(--foreground);
    }
    [data-selected] & {
      --ui-translate-x: calc(100% - 2px);
      translate: var(--ui-translate-x) var(--ui-translate-y);
    }
    [data-selected] &:is(.dark *) {
      background-color: var(--primary-foreground);
    }
    [data-size="default"] & {
      width: calc(var(--spacing) * 4);
      height: calc(var(--spacing) * 4);
    }
    [data-size="sm"] & {
      width: calc(var(--spacing) * 3);
      height: calc(var(--spacing) * 3);
    }
  }
`;

export type SwitchSize = "default" | "sm";

export interface SwitchProps extends SwitchComponentProps {
  size?: SwitchSize;
  children?: never;
}

/**
 * ```tsx
 * <Switch id="wifi" defaultSelected onChange={(on) => setWifi(on)} />
 * <Label for="wifi">Wi-Fi</Label>
 * ```
 *
 * The thumb's position is a rule keyed off the track's `data-selected`, not a
 * class the component swaps: `[data-selected] &` moves it, so the transition
 * runs off one attribute changing.
 */
export function Switch(props: Incoming<SwitchProps>) {
  return (
    <AriaSwitch
      {...props}
      data-slot="switch"
      data-size={props.size?.() ?? "default"}
      class={clsx(track, props.class?.(), props.className?.())}
    >
      <span data-slot="switch-thumb" class={thumb} />
    </AriaSwitch>
  );
}
