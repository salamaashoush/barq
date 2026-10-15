/**
 * Text with a highlight sweeping across it, for work that is still running.
 *
 * ```tsx
 * <p class={ui(shimmer, muted)} style={shimmerStyle({ duration: 1500 })}>
 *   Generating response…
 * </p>
 * ```
 *
 * The highlight is a gradient clipped to the glyphs, built from `currentColor`,
 * so it follows whatever colour the text already has and needs no second
 * colour chosen for it. `--shimmer-color` replaces the derived highlight when
 * one is wanted.
 *
 * Under `prefers-reduced-motion` the gradient goes with the animation. A sweep
 * frozen mid-way would leave part of the sentence at a fifth of its contrast.
 */

import { css, globalCss } from "@barqjs/css";

import "../theme/layers.ts";

globalCss`
@property --shimmer-angle {
  syntax: "<angle>";
  inherits: true;
  initial-value: 20deg;
}
@property --shimmer-image {
  syntax: "*";
  inherits: false;
}
@property --shimmer-text-fill {
  syntax: "*";
  inherits: false;
}
@keyframes ui-shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: 0 0;
  }
}
`;

export const shimmer = css`
  @layer barq.ui {
    --_spread: var(--shimmer-spread, calc(3ch + 40px));
    --_base: currentColor;
    --_highlight: var(--shimmer-color, oklch(from currentColor l c h / calc(alpha * 0.2)));

    background-image: var(
      --shimmer-image,
      linear-gradient(
        calc(90deg + var(--shimmer-angle)),
        var(--_base) calc(50% - var(--_spread)),
        color-mix(in oklch, var(--_highlight), var(--_base) 50%) calc(50% - var(--_spread) * 0.5),
        var(--_highlight) 50%,
        color-mix(in oklch, var(--_highlight), var(--_base) 50%) calc(50% + var(--_spread) * 0.5),
        var(--_base) calc(50% + var(--_spread))
      )
    );
    background-repeat: no-repeat;
    background-size: calc(200% + var(--_spread) * 2) 100%;
    background-position: 0 0;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: var(--shimmer-text-fill, transparent);
    animation: ui-shimmer var(--shimmer-duration, 2s) linear infinite;

    &:is(.dark *) {
      --_highlight: var(
        --shimmer-color,
        oklch(from currentColor max(0.8, calc(l + 0.4)) c h / calc(alpha + 0.4))
      );
    }

    &:where(:dir(rtl)):where([dir="rtl"], [dir="rtl"] *) {
      animation-direction: reverse;
    }

    @media (prefers-reduced-motion: reduce) {
      animation: none;
      background-image: none;
      -webkit-text-fill-color: currentColor;
    }
  }
`;

/**
 * One sweep and then still.
 *
 * `&&` here and on {@link shimmerReverse}: each overrides one longhand of the
 * `animation` shorthand {@link shimmer} sets, and at equal specificity the
 * winner would be whichever module happened to register last.
 */
export const shimmerOnce = css`
  @layer barq.ui {
    && {
      animation-iteration-count: 1;
    }
  }
`;

export const shimmerReverse = css`
  @layer barq.ui {
    && {
      animation-direction: reverse;
    }
  }
`;

/** Plain text again, for a state that has finished. */
export const shimmerNone = css`
  @layer barq.ui {
    --shimmer-image: none;
    --shimmer-text-fill: currentColor;
  }
`;

export interface ShimmerOptions {
  /** The highlight, in place of the one derived from the text colour. */
  color?: string;
  /** A percentage, mixing `color` toward transparent. */
  opacity?: number;
  /** One sweep, in milliseconds. */
  duration?: number;
  /** Half the highlight's width. A number is a multiple of `--spacing`. */
  spread?: number | string;
  /** The tilt of the band, in degrees. */
  angle?: number;
}

/** The custom properties {@link shimmer} reads, for an element's `style`. */
export function shimmerStyle(options: ShimmerOptions): Record<string, string> {
  const out: Record<string, string> = {};
  if (options.color !== undefined) {
    out["--shimmer-color"] =
      options.opacity === undefined
        ? options.color
        : `color-mix(in oklch, ${options.color} ${String(options.opacity)}%, transparent)`;
  }
  if (options.duration !== undefined) out["--shimmer-duration"] = `${String(options.duration)}ms`;
  if (options.spread !== undefined) {
    out["--shimmer-spread"] =
      typeof options.spread === "number"
        ? `calc(var(--spacing) * ${String(options.spread)})`
        : options.spread;
  }
  if (options.angle !== undefined) out["--shimmer-angle"] = `${String(options.angle)}deg`;
  return out;
}
