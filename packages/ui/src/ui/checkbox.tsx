import { Checkbox as AriaCheckbox, type CheckboxComponentProps } from "@barqjs/aria/checkbox";
import { Show, type Incoming } from "@barqjs/core";
import { clsx, css } from "@barqjs/css";
import { Check } from "@barqjs/lucide/icons/check";
import { Minus } from "@barqjs/lucide/icons/minus";

import "../theme/layers.ts";

const box = css`
  @layer barq.ui {
    display: inline-grid;
    width: calc(var(--spacing) * 4);
    height: calc(var(--spacing) * 4);
    flex-shrink: 0;
    place-content: center;
    border-radius: 4px;
    border-style: var(--ui-border-style);
    border-width: 1px;
    border-color: var(--input);
    --ui-shadow: 0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05));
    box-shadow:
      var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
      var(--ui-ring-shadow), var(--ui-shadow);
    transition-property: box-shadow;
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
    &[data-selected] {
      border-color: var(--primary);
      background-color: var(--primary);
      color: var(--primary-foreground);
    }
    &:is(.dark *)[data-selected] {
      background-color: var(--primary);
    }
    &[data-indeterminate] {
      border-color: var(--primary);
      background-color: var(--primary);
      color: var(--primary-foreground);
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
    display: none;
    place-content: center;
    color: currentcolor;
    transition-property: none;
    & > svg {
      width: calc(var(--spacing) * 3.5);
      height: calc(var(--spacing) * 3.5);
    }
    [data-indeterminate] & {
      display: grid;
    }
    [data-selected] & {
      display: grid;
    }
  }
`;

export interface CheckboxProps extends CheckboxComponentProps {
  children?: never;
}

/**
 * ```tsx
 * <Checkbox id="terms" onChange={(on) => accepted.set(on)} />
 * <Label for="terms">Accept the terms</Label>
 * ```
 *
 * The box IS the `<label>`: it wraps a visually hidden `<input type="checkbox">`,
 * so clicking it toggles through the platform rather than through a handler, and
 * a `<Label for>` pointing at the same id is a second label for the same input.
 * shadcn renders a `<button role="checkbox">` and has to reimplement all of
 * that.
 */
export function Checkbox(props: Incoming<CheckboxProps>) {
  return (
    <AriaCheckbox
      {...props}
      data-slot="checkbox"
      class={clsx(box, props.class?.(), props.className?.())}
    >
      <span data-slot="checkbox-indicator" class={indicator}>
        <Show when={props.isIndeterminate?.() === true} fallback={<Check />}>
          <Minus />
        </Show>
      </span>
    </AriaCheckbox>
  );
}
