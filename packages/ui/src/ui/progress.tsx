import { progressBar } from "@barqjs/aria/link";
import { fromProps, mergeProps } from "@barqjs/aria/utils";
import { Show, type Incoming } from "@barqjs/core";
import { clsx, css } from "@barqjs/css";

import "../theme/layers.ts";
import type { UiProps } from "../lib/props.ts";

const track = css`
  @layer barq.ui {
    position: relative;
    height: calc(var(--spacing) * 2);
    width: 100%;
    overflow: hidden;
    border-radius: calc(infinity * 1px);
    background-color: var(--primary);
    @supports (color: color-mix(in lab, red, red)) {
      background-color: color-mix(in oklab, var(--primary) 20%, transparent);
    }
  }
`;

const bar = css`
  @layer barq.ui {
    height: 100%;
    width: 100%;
    flex: 1;
    background-color: var(--primary);
    transition-property: all;
    transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
    transition-duration: var(--ui-duration, var(--default-transition-duration));
  }
`;

export interface ProgressProps extends UiProps {
  /** 0 to `maxValue`. @default 0 */
  value?: number;
  minValue?: number;
  maxValue?: number;
  isIndeterminate?: boolean;
  /** Rendered visually hidden, and what names the bar. */
  label?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/**
 * ```tsx
 * <Progress value={60} label="Upload" />
 * ```
 *
 * Built on the `progressBar` hook rather than `@barqjs/aria`'s component,
 * because that one renders the value as visible text — right for a bar with a
 * number beside it, and inside this track it would be text on top of the fill.
 *
 * Give it a `label` or an `aria-label`. A progress bar with neither is a
 * rectangle a screen reader announces as "progress bar, 60 percent" with no
 * word about what is at sixty percent.
 */
export function Progress(props: Incoming<ProgressProps>) {
  const options = fromProps(props);
  const { progressBarProps, labelProps, percentage } = progressBar(options);

  const elementProps = mergeProps(progressBarProps, {
    "data-slot": "progress",
    "data-testid": () => props["data-testid"]?.(),
    class: () => clsx(track, props.class?.(), props.className?.()),
    style: () => props.style?.(),
  });

  const fill = (): Record<string, string> => ({
    transform:
      props.isIndeterminate?.() === true
        ? "translateX(-50%)"
        : `translateX(-${String(100 - percentage() * 100)}%)`,
  });

  return (
    <div {...elementProps}>
      <Show when={props.label?.() !== undefined}>
        <span {...labelProps} class={visuallyHidden}>
          {props.label}
        </span>
      </Show>
      <div data-slot="progress-indicator" class={bar} style={fill()} />
    </div>
  );
}

/** The label is named to assistive technology and drawn nowhere. */
const visuallyHidden = css`
  @layer barq.ui {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border-width: 0;
  }
`;
