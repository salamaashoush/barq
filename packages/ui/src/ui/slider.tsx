import {
  Slider as AriaSlider,
  SliderOutput,
  SliderThumb,
  SliderTrack,
  useSlider,
  type SliderComponentProps,
  type SliderContextValue,
} from "@barqjs/aria/slider";
import type { Incoming } from "@barqjs/core";
import { clsx, css } from "@barqjs/css";

import "../theme/layers.ts";

const root = css`
  @layer barq.ui {
    position: relative;
    display: flex;
    width: 100%;
    touch-action: none;
    align-items: center;
    -webkit-user-select: none;
    user-select: none;
    &[data-orientation="vertical"] {
      height: 100%;
      min-height: calc(var(--spacing) * 44);
      width: auto;
      flex-direction: column;
    }
    &[data-disabled] {
      opacity: 50%;
    }
  }
`;

const track = css`
  @layer barq.ui {
    position: relative;
    flex-grow: 1;
    border-radius: calc(infinity * 1px);
    background-color: var(--muted);
    &[data-orientation="horizontal"] {
      height: calc(var(--spacing) * 1.5);
      width: 100%;
    }
    &[data-orientation="vertical"] {
      height: 100%;
      width: calc(var(--spacing) * 1.5);
    }
  }
`;

const thumb = css`
  @layer barq.ui {
    position: absolute;
    display: block;
    width: calc(var(--spacing) * 4);
    height: calc(var(--spacing) * 4);
    flex-shrink: 0;
    border-radius: calc(infinity * 1px);
    border-style: var(--ui-border-style);
    border-width: 1px;
    border-color: var(--primary);
    background-color: var(--background);
    --ui-shadow:
      0 1px 3px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.1)),
      0 1px 2px -1px var(--ui-shadow-color, rgb(0 0 0 / 0.1));
    box-shadow:
      var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
      var(--ui-ring-shadow), var(--ui-shadow);
    transition-property: color, box-shadow;
    transition-timing-function: var(--ui-ease, var(--default-transition-timing-function));
    transition-duration: var(--ui-duration, var(--default-transition-duration));
    @media (hover: hover) {
      &:hover {
        --ui-ring-shadow: var(--ui-ring-inset,) 0 0 0 calc(4px + var(--ui-ring-offset-width))
          var(--ui-ring-color, currentcolor);
        box-shadow:
          var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
          var(--ui-ring-shadow), var(--ui-shadow);
      }
    }
    &[data-focus-visible] {
      --ui-ring-shadow: var(--ui-ring-inset,) 0 0 0 calc(4px + var(--ui-ring-offset-width))
        var(--ui-ring-color, currentcolor);
      box-shadow:
        var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow),
        var(--ui-ring-shadow), var(--ui-shadow);
      --ui-outline-style: none;
      outline-style: none;
    }
    &[data-disabled] {
      pointer-events: none;
      opacity: 50%;
    }
  }
`;

const output = css`
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

/**
 * The filled part of the track, drawn by the track itself.
 *
 * shadcn renders a `<SliderRange>` element for it. There is nothing for such an
 * element to be here — `@barqjs/aria`'s track renders one child per thumb — and
 * it does not need one: the start and end are two custom properties, so
 * dragging writes two numbers and produces no new CSS and no new node.
 *
 * A GRADIENT rather than a pseudo-element, and that is what makes the thumb
 * visible. shadcn clips its `<SliderRange>` to the rounded track with
 * `overflow: hidden`, but the thumb is a child of the track here rather than
 * its sibling, so the same rule cut a 16px thumb down to the track's 6px and
 * left a sliver. A background is clipped by `border-radius` on its own, with
 * the same square ends shadcn's clipped element has, and it clips nothing else.
 */
const range = css`
  @layer barq.ui {
    &[data-orientation="horizontal"] {
      background-image: linear-gradient(
        to right,
        transparent var(--barq-slider-start),
        var(--primary) var(--barq-slider-start),
        var(--primary) var(--barq-slider-end),
        transparent var(--barq-slider-end)
      );
    }

    &[data-orientation="vertical"] {
      background-image: linear-gradient(
        to top,
        transparent var(--barq-slider-start),
        var(--primary) var(--barq-slider-start),
        var(--primary) var(--barq-slider-end),
        transparent var(--barq-slider-end)
      );
    }
  }
`;

/**
 * Where each thumb sits, keyed off the TRACK's orientation rather than its own.
 *
 * The thumb carries no `data-orientation` — `@barqjs/aria` writes that on the
 * group and on the track — so `&[data-orientation="horizontal"]` matched
 * nothing and every thumb sat at `left: 0` whatever its value. That is invisible
 * to a test asserting on the custom property, and the first thing you see in a
 * browser.
 *
 * The CROSS axis is set here too. shadcn's thumb is a sibling of the track and
 * is centred by the root's `align-items: center`; this one is a child of a
 * 6px-tall track, where the static position is the track's top edge and a 16px
 * thumb hangs 10px below it.
 */
const place = css`
  @layer barq.ui {
    [data-orientation="horizontal"] & {
      left: var(--barq-slider-thumb);
      top: 50%;
      translate: -50% -50%;
    }

    [data-orientation="vertical"] & {
      bottom: var(--barq-slider-thumb);
      left: 50%;
      translate: -50% 50%;
    }
  }
`;

export interface SliderProps extends SliderComponentProps {}

/**
 * ```tsx
 * <Slider aria-label="Volume" defaultValue={30} onChange={([v]) => volume.set(v)} />
 * <Slider aria-label="Price" defaultValue={[20, 60]} />
 * ```
 *
 * One value or two: an array makes it a range, and the second thumb is real
 * rather than decorative — each is a visually hidden `<input type="range">`, so
 * the keyboard, the form and a screen reader all talk to the platform.
 */
export function Slider(props: Incoming<SliderProps>) {
  return (
    <AriaSlider
      {...props}
      data-slot="slider"
      class={clsx(root, props.class?.(), props.className?.())}
    >
      <SliderOutput data-slot="slider-output" class={output} />
      <Fill />
    </AriaSlider>
  );
}

/** The track and its thumbs, reading the state the enclosing slider provides. */
function Fill() {
  const group = useSlider();

  const bounds = (): Record<string, string> => {
    const percents = group.state.values().map((_, index) => group.state.getThumbPercent(index));
    const start = percents.length > 1 ? Math.min(...percents) : 0;
    const end = percents.length > 1 ? Math.max(...percents) : (percents[0] ?? 0);
    return {
      "--barq-slider-start": percent(start),
      "--barq-slider-end": percent(end),
    };
  };

  return (
    <SliderTrack data-slot="slider-track" class={clsx(track, range)} style={bounds()}>
      {(index: number) => (
        <SliderThumb
          index={index}
          data-slot="slider-thumb"
          class={clsx(thumb, place)}
          style={at(group, index)}
        />
      )}
    </SliderTrack>
  );
}

/**
 * A CALL, not the object literal it returns, and that is load-bearing.
 *
 * The compiler proves reactivity rather than guessing it, and
 * `state.getThumbPercent` is an opaque method: written as
 * `style={{ "--x": percent(...) }}` the object is classified static, evaluated
 * once, and the thumb never moves. A call is not something the compiler will
 * evaluate at the call site, so the prop crosses as `() => at(group, index)`
 * and the consumer's effect re-reads it. The track's own `style={bounds()}` is
 * the same shape for the same reason.
 */
function at(group: SliderContextValue, index: number): Record<string, string> {
  return { "--barq-slider-thumb": percent(group.state.getThumbPercent(index)) };
}

/** Two decimal places, because a third of a track is otherwise seventeen digits. */
function percent(fraction: number): string {
  return `${String(Math.round(fraction * 10000) / 100)}%`;
}
