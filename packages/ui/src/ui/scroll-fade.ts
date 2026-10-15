/**
 * A scroller whose edges fade where there is more to scroll to.
 *
 * ```tsx
 * <div class={ui(scrollFade, list)} style={scrollFadeStyle({ size: 6 })}>
 * ```
 *
 * The fade is a MASK rather than a gradient laid over the content, so it needs
 * no knowledge of what is behind the scroller and works over an image as well
 * as over a flat colour.
 *
 * Each edge's depth is a registered custom property animated on the element's
 * own scroll timeline: zero at the start of the scroll range, full size once
 * the content has moved `--scroll-fade-reveal` away from that edge. Nothing
 * listens for scroll events. A browser without `animation-timeline` gets both
 * edges faded all the time, which is the worse of the two honest answers and
 * the only one that needs no script.
 *
 * `S` and `E` follow the inline direction and mirror under `dir="rtl"`; `L` and
 * `R` are physical for the cases that really are.
 */

import { css, globalCss } from "@barqjs/css";

import "../theme/layers.ts";

globalCss`
@property --scroll-fade-t {
  syntax: "<length-percentage>";
  inherits: false;
  initial-value: 0px;
}
@property --scroll-fade-b {
  syntax: "<length-percentage>";
  inherits: false;
  initial-value: 0px;
}
@property --scroll-fade-s {
  syntax: "<length-percentage>";
  inherits: false;
  initial-value: 0px;
}
@property --scroll-fade-e {
  syntax: "<length-percentage>";
  inherits: false;
  initial-value: 0px;
}
@property --scroll-fade-mask {
  syntax: "*";
  inherits: false;
}
@keyframes scroll-fade-reveal-t {
  from {
    --scroll-fade-t: 0px;
  }
  to {
    --scroll-fade-t: var(--_scroll-fade-size-t, var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10))));
  }
}
@keyframes scroll-fade-reveal-b {
  from {
    --scroll-fade-b: var(--_scroll-fade-size-b, var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10))));
  }
  to {
    --scroll-fade-b: 0px;
  }
}
@keyframes scroll-fade-reveal-s {
  from {
    --scroll-fade-s: 0px;
  }
  to {
    --scroll-fade-s: var(--_scroll-fade-size-s, var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10))));
  }
}
@keyframes scroll-fade-reveal-e {
  from {
    --scroll-fade-e: var(--_scroll-fade-size-e, var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10))));
  }
  to {
    --scroll-fade-e: 0px;
  }
}
`;

/** Both block edges. */
export const scrollFade = css`
  @layer barq.ui {
    --_scroll-fade-size-t: var(
      --scroll-fade-t-size,
      var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
    );
    --_scroll-fade-size-b: var(
      --scroll-fade-b-size,
      var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
    );
    --scroll-fade-block: linear-gradient(
      to bottom,
      transparent 0,
      #000 var(--scroll-fade-t, 0px),
      #000 calc(100% - var(--scroll-fade-b, 0px)),
      transparent 100%
    );
    -webkit-mask-image: var(--scroll-fade-mask, var(--scroll-fade-block));
    mask-image: var(--scroll-fade-mask, var(--scroll-fade-block));
    -webkit-mask-composite: source-in;
    mask-composite: intersect;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;

    @supports (animation-timeline: scroll()) {
      animation:
        scroll-fade-reveal-t 1ms ease-in-out,
        scroll-fade-reveal-b 1ms ease-in-out;
      animation-timeline: scroll(self y), scroll(self y);
      animation-range:
        0 var(--scroll-fade-reveal, calc(var(--spacing) * 24)),
        calc(100% - var(--scroll-fade-reveal, calc(var(--spacing) * 24))) 100%;
      animation-fill-mode: both;
    }

    @supports not (animation-timeline: scroll()) {
      --scroll-fade-t: var(--_scroll-fade-size-t);
      --scroll-fade-b: var(--_scroll-fade-size-b);
    }
  }
`;

export const scrollFadeY = scrollFade;

/** Both inline edges. */
export const scrollFadeX = css`
  @layer barq.ui {
    --_scroll-fade-size-s: var(
      --scroll-fade-s-size,
      var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
    );
    --_scroll-fade-size-e: var(
      --scroll-fade-e-size,
      var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
    );
    --scroll-fade-inline: linear-gradient(
      to right,
      transparent 0,
      #000 var(--scroll-fade-s, 0px),
      #000 calc(100% - var(--scroll-fade-e, 0px)),
      transparent 100%
    );
    -webkit-mask-image: var(--scroll-fade-mask, var(--scroll-fade-inline));
    mask-image: var(--scroll-fade-mask, var(--scroll-fade-inline));
    -webkit-mask-composite: source-in;
    mask-composite: intersect;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;

    &:where(:dir(rtl)):where([dir="rtl"], [dir="rtl"] *) {
      --scroll-fade-inline: linear-gradient(
        to left,
        transparent 0,
        #000 var(--scroll-fade-s, 0px),
        #000 calc(100% - var(--scroll-fade-e, 0px)),
        transparent 100%
      );
    }

    @supports (animation-timeline: scroll()) {
      animation:
        scroll-fade-reveal-s 1ms ease-in-out,
        scroll-fade-reveal-e 1ms ease-in-out;
      animation-timeline: scroll(self inline), scroll(self inline);
      animation-range:
        0 var(--scroll-fade-reveal, calc(var(--spacing) * 24)),
        calc(100% - var(--scroll-fade-reveal, calc(var(--spacing) * 24))) 100%;
      animation-fill-mode: both;
    }

    @supports not (animation-timeline: scroll()) {
      --scroll-fade-s: var(--_scroll-fade-size-s);
      --scroll-fade-e: var(--_scroll-fade-size-e);
    }
  }
`;

/** The top edge only. */
export const scrollFadeT = css`
  @layer barq.ui {
    --_scroll-fade-size-t: var(
      --scroll-fade-t-size,
      var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
    );
    --scroll-fade-mask: linear-gradient(
      to bottom,
      transparent 0,
      #000 var(--scroll-fade-t, 0px),
      #000 100%
    );
    -webkit-mask-image: var(--scroll-fade-mask);
    mask-image: var(--scroll-fade-mask);
    -webkit-mask-composite: source-in;
    mask-composite: intersect;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;

    @supports (animation-timeline: scroll()) {
      animation: scroll-fade-reveal-t 1ms ease-in-out;
      animation-timeline: scroll(self y);
      animation-range: 0 var(--scroll-fade-reveal, calc(var(--spacing) * 24));
      animation-fill-mode: both;
    }

    @supports not (animation-timeline: scroll()) {
      --scroll-fade-t: var(--_scroll-fade-size-t);
    }
  }
`;

/** The bottom edge only. */
export const scrollFadeB = css`
  @layer barq.ui {
    --_scroll-fade-size-b: var(
      --scroll-fade-b-size,
      var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
    );
    --scroll-fade-mask: linear-gradient(
      to bottom,
      #000 0,
      #000 calc(100% - var(--scroll-fade-b, 0px)),
      transparent 100%
    );
    -webkit-mask-image: var(--scroll-fade-mask);
    mask-image: var(--scroll-fade-mask);
    -webkit-mask-composite: source-in;
    mask-composite: intersect;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;

    @supports (animation-timeline: scroll()) {
      animation: scroll-fade-reveal-b 1ms ease-in-out;
      animation-timeline: scroll(self y);
      animation-range: calc(100% - var(--scroll-fade-reveal, calc(var(--spacing) * 24))) 100%;
      animation-fill-mode: both;
    }

    @supports not (animation-timeline: scroll()) {
      --scroll-fade-b: var(--_scroll-fade-size-b);
    }
  }
`;

/** The left edge, whichever way the text runs. */
export const scrollFadeL = css`
  @layer barq.ui {
    --_scroll-fade-size-s: var(
      --scroll-fade-s-size,
      var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
    );
    --scroll-fade-mask: linear-gradient(
      to right,
      transparent 0,
      #000 var(--scroll-fade-s, 0px),
      #000 100%
    );
    -webkit-mask-image: var(--scroll-fade-mask);
    mask-image: var(--scroll-fade-mask);
    -webkit-mask-composite: source-in;
    mask-composite: intersect;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;

    @supports (animation-timeline: scroll()) {
      animation: scroll-fade-reveal-s 1ms ease-in-out;
      animation-timeline: scroll(self x);
      animation-range: 0 var(--scroll-fade-reveal, calc(var(--spacing) * 24));
      animation-fill-mode: both;
    }

    @supports not (animation-timeline: scroll()) {
      --scroll-fade-s: var(--_scroll-fade-size-s);
    }
  }
`;

/** The right edge, whichever way the text runs. */
export const scrollFadeR = css`
  @layer barq.ui {
    --_scroll-fade-size-e: var(
      --scroll-fade-e-size,
      var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
    );
    --scroll-fade-mask: linear-gradient(
      to right,
      #000 0,
      #000 calc(100% - var(--scroll-fade-e, 0px)),
      transparent 100%
    );
    -webkit-mask-image: var(--scroll-fade-mask);
    mask-image: var(--scroll-fade-mask);
    -webkit-mask-composite: source-in;
    mask-composite: intersect;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;

    @supports (animation-timeline: scroll()) {
      animation: scroll-fade-reveal-e 1ms ease-in-out;
      animation-timeline: scroll(self x);
      animation-range: calc(100% - var(--scroll-fade-reveal, calc(var(--spacing) * 24))) 100%;
      animation-fill-mode: both;
    }

    @supports not (animation-timeline: scroll()) {
      --scroll-fade-e: var(--_scroll-fade-size-e);
    }
  }
`;

/** The inline-start edge only. */
export const scrollFadeS = css`
  @layer barq.ui {
    --_scroll-fade-size-s: var(
      --scroll-fade-s-size,
      var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
    );
    --scroll-fade-mask: linear-gradient(
      to right,
      transparent 0,
      #000 var(--scroll-fade-s, 0px),
      #000 100%
    );
    -webkit-mask-image: var(--scroll-fade-mask);
    mask-image: var(--scroll-fade-mask);
    -webkit-mask-composite: source-in;
    mask-composite: intersect;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;

    &:where(:dir(rtl)):where([dir="rtl"], [dir="rtl"] *) {
      --scroll-fade-mask: linear-gradient(
        to left,
        transparent 0,
        #000 var(--scroll-fade-s, 0px),
        #000 100%
      );
    }

    @supports (animation-timeline: scroll()) {
      animation: scroll-fade-reveal-s 1ms ease-in-out;
      animation-timeline: scroll(self inline);
      animation-range: 0 var(--scroll-fade-reveal, calc(var(--spacing) * 24));
      animation-fill-mode: both;
    }

    @supports not (animation-timeline: scroll()) {
      --scroll-fade-s: var(--_scroll-fade-size-s);
    }
  }
`;

/** The inline-end edge only. */
export const scrollFadeE = css`
  @layer barq.ui {
    --_scroll-fade-size-e: var(
      --scroll-fade-e-size,
      var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
    );
    --scroll-fade-mask: linear-gradient(
      to right,
      #000 0,
      #000 calc(100% - var(--scroll-fade-e, 0px)),
      transparent 100%
    );
    -webkit-mask-image: var(--scroll-fade-mask);
    mask-image: var(--scroll-fade-mask);
    -webkit-mask-composite: source-in;
    mask-composite: intersect;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;

    &:where(:dir(rtl)):where([dir="rtl"], [dir="rtl"] *) {
      --scroll-fade-mask: linear-gradient(
        to left,
        #000 0,
        #000 calc(100% - var(--scroll-fade-e, 0px)),
        transparent 100%
      );
    }

    @supports (animation-timeline: scroll()) {
      animation: scroll-fade-reveal-e 1ms ease-in-out;
      animation-timeline: scroll(self inline);
      animation-range: calc(100% - var(--scroll-fade-reveal, calc(var(--spacing) * 24))) 100%;
      animation-fill-mode: both;
    }

    @supports not (animation-timeline: scroll()) {
      --scroll-fade-e: var(--_scroll-fade-size-e);
    }
  }
`;

/**
 * No fade, for a breakpoint or a state that turns it off.
 *
 * `&&` so it wins over a single-edge class whatever order the two modules were
 * registered in: both write `--scroll-fade-mask`.
 */
export const scrollFadeNone = css`
  @layer barq.ui {
    && {
      --scroll-fade-mask: none;
    }
  }
`;

export interface ScrollFadeOptions {
  /** Every edge. A number is a multiple of `--spacing`; a string is a length or a percentage. */
  size?: number | string;
  top?: number | string;
  bottom?: number | string;
  start?: number | string;
  end?: number | string;
  /** How far the content scrolls before an edge reaches its full depth. */
  reveal?: number | string;
}

const length = (value: number | string): string =>
  typeof value === "number" ? `calc(var(--spacing) * ${String(value)})` : value;

/** The custom properties the classes read, for an element's `style`. */
export function scrollFadeStyle(options: ScrollFadeOptions): Record<string, string> {
  const out: Record<string, string> = {};
  if (options.size !== undefined) out["--scroll-fade-size"] = length(options.size);
  if (options.top !== undefined) out["--scroll-fade-t-size"] = length(options.top);
  if (options.bottom !== undefined) out["--scroll-fade-b-size"] = length(options.bottom);
  if (options.start !== undefined) out["--scroll-fade-s-size"] = length(options.start);
  if (options.end !== undefined) out["--scroll-fade-e-size"] = length(options.end);
  if (options.reveal !== undefined) out["--scroll-fade-reveal"] = length(options.reveal);
  return out;
}
