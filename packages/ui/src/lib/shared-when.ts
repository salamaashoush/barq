/**
 * What a component looks like in a state something else put it in.
 *
 * `when` and not `state`, because `state` is what a component calls the object
 * `@barqjs/aria` hands it and the two met in nine files.
 */

import { firstThatWorks, layer } from "@barqjs/css";

const ui = layer("barq.ui");

export const when = ui.create({
  /** Disabled, where the element is not meant to answer a pointer at all. */
  disabled: {
    "[data-disabled]": { pointerEvents: "none", opacity: "50%" },
  },

  /** Disabled, where it is and says so. */
  disabledCursor: {
    "[data-disabled]": { cursor: "not-allowed", opacity: "50%" },
  },

  /** The highlight `@barqjs/aria` moves through a collection. */
  focused: {
    "[data-focused]": { backgroundColor: "var(--accent)", color: "var(--accent-foreground)" },
  },

  /** A translucent input surface in dark mode. */
  darkInput: {
    ":is(.dark *)": {
      backgroundColor: "var(--input)",
      "@supports (color: color-mix(in lab, red, red))": {
        backgroundColor: "color-mix(in oklab, var(--input) 30%, transparent)",
      },
    },
  },

  /**
   * The exit animation every overlay in this package runs.
   *
   * `firstThatWorks` because `calc(0/100)` is the fallback a browser without
   * the plain number keeps, which is CSS's own mechanism written the right way
   * round.
   */
  closing: {
    "[data-closed]": {
      animation:
        "exit var(--ui-animation-duration, var(--ui-duration, 0.15s)) var(--ui-ease, ease) var(--ui-animation-delay, 0s) var(--ui-animation-iteration-count, 1) var(--ui-animation-direction, normal) var(--ui-animation-fill-mode, none)",
      "--ui-exit-opacity": firstThatWorks("0", "calc(0/100)"),
      "--ui-exit-scale": firstThatWorks("0.95", "calc(95*1%)"),
    },
  },
});
