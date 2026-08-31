import type { Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";
import { uiProps } from "../lib/slot.ts";

const label = css`
  @layer barq.ui {
    display: flex;
    align-items: center;
    gap: calc(var(--spacing) * 2);
    font-size: var(--text-sm);
    line-height: var(--ui-leading, var(--text-sm--line-height));
    --ui-leading: 1;
    line-height: 1;
    --ui-font-weight: var(--font-weight-medium);
    font-weight: var(--font-weight-medium);
    -webkit-user-select: none;
    user-select: none;
    &[data-disabled] {
      pointer-events: none;
      opacity: 50%;
    }
    [data-disabled] & {
      pointer-events: none;
      opacity: 50%;
    }
  }
`;

export interface LabelProps extends UiProps {
  /** The id of the control this names. `htmlFor` is accepted too. */
  for?: string;
  htmlFor?: string;
}

/**
 * ```tsx
 * <Label for="terms">Accept the terms</Label>
 * <Checkbox id="terms" />
 * ```
 *
 * It dims itself inside anything carrying `data-disabled`, which is what every
 * `@barqjs/aria` control writes while it is disabled. shadcn keys the same rule
 * off Tailwind's `peer` and `group` marker classes; there are none here, so the
 * state the controls already publish does the job.
 */
export function Label(props: Incoming<LabelProps>) {
  return (
    <label {...uiProps("label", label, props)} for={props.for?.() ?? props.htmlFor?.()}>
      {props.children}
    </label>
  );
}
