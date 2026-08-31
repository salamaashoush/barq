import {
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  type RadioComponentProps,
  type RadioGroupComponentProps,
} from "@barqjs/aria/radio";
import type { Incoming } from "@barqjs/core";
import { clsx, css } from "@barqjs/css";
import { Circle } from "@barqjs/lucide/icons/circle";

import "../theme/layers.ts";

const items = css`
  @layer barq.ui {
    display: grid;
    gap: calc(var(--spacing) * 3);
  }
`;

const circle = css`
  @layer barq.ui {
    position: relative;
    display: inline-flex;
    aspect-ratio: 1 / 1;
    width: calc(var(--spacing) * 4);
    height: calc(var(--spacing) * 4);
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: calc(infinity * 1px);
    border-style: var(--ui-border-style);
    border-width: 1px;
    border-color: var(--input);
    color: var(--primary);
    --ui-shadow: 0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05));
    box-shadow:
      var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
      var(--ui-ring-shadow), var(--ui-shadow);
    transition-property: color, box-shadow;
    transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
    transition-duration: var(--ui-duration, var(--default-transition-duration));
    --ui-outline-style: none;
    outline-style: none;
    &:is(.dark *) {
      background-color: var(--input);
      @supports (color: color-mix(in lab, red, red)) {
        background-color: color-mix(in oklab, var(--input) 30%, transparent);
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
    &[data-invalid] {
      border-color: var(--destructive);
      --ui-ring-color: var(--destructive);
      @supports (color: color-mix(in lab, red, red)) {
        --ui-ring-color: color-mix(in oklab, var(--destructive) 20%, transparent);
      }
    }
    &:is(.dark *)[data-invalid] {
      --ui-ring-color: var(--destructive);
      @supports (color: color-mix(in lab, red, red)) {
        --ui-ring-color: color-mix(in oklab, var(--destructive) 40%, transparent);
      }
    }
  }
`;

const indicator = css`
  @layer barq.ui {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    & > svg {
      position: absolute;
      top: calc(1 / 2 * 100%);
      left: calc(1 / 2 * 100%);
      display: none;
      width: calc(var(--spacing) * 2);
      height: calc(var(--spacing) * 2);
      --ui-translate-x: calc(calc(1 / 2 * 100%) * -1);
      translate: var(--ui-translate-x) var(--ui-translate-y);
      --ui-translate-y: calc(calc(1 / 2 * 100%) * -1);
      fill: var(--primary);
      stroke: var(--primary);
    }
    [data-selected] & > svg {
      display: block;
    }
  }
`;

export interface RadioGroupProps extends RadioGroupComponentProps {}

/**
 * ```tsx
 * <RadioGroup label="Size" defaultValue="m">
 *   <RadioGroupItem value="s" id="s" />
 *   <Label for="s">Small</Label>
 * </RadioGroup>
 * ```
 *
 * The grid is an inner element rather than the group itself. `@barqjs/aria`
 * renders the label, description and error message as spans inside the group,
 * and a grid would give each of them a row and a gap whether it held anything
 * or not.
 */
export function RadioGroup(props: Incoming<RadioGroupProps>) {
  return (
    <AriaRadioGroup {...props} data-slot="radio-group">
      <div data-slot="radio-group-items" class={clsx(items, props.class?.(), props.className?.())}>
        {props.children}
      </div>
    </AriaRadioGroup>
  );
}

export interface RadioGroupItemProps extends RadioComponentProps {
  children?: never;
}

export function RadioGroupItem(props: Incoming<RadioGroupItemProps>) {
  return (
    <AriaRadio
      {...props}
      data-slot="radio-group-item"
      class={clsx(circle, props.class?.(), props.className?.())}
    >
      <span data-slot="radio-group-indicator" class={indicator}>
        <Circle />
      </span>
    </AriaRadio>
  );
}
