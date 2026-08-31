/**
 * The box: its edge, its shadow, its outline and how it moves.
 *
 * `outline` and `forcedColors` are in one file and in this order on purpose.
 * `outline` sets `outline-style: none`; `forcedColors` sets
 * `outline: 2px solid transparent` under an `@media`, and a shorthand sets
 * `outline-style` too. They are different atoms with different keys, so both
 * apply to an element composing both and neither is more specific: the later
 * rule wins. One file makes that order a fact of this file rather than of
 * whichever module a bundler happened to emit first.
 */

import { layer } from "@barqjs/css";

const ui = layer("barq.ui");

export const box = ui.create({
  /** `border`, whose style comes from the theme so a reset cannot take it. */
  border: {
    borderStyle: "var(--ui-border-style)",
    borderWidth: "1px",
  },

  /**
   * `shadow-xs`, and the four slots it shares the property with.
   *
   * Each of the five is a custom property some other utility sets on its own,
   * and naming all five here is what lets a ring and a drop shadow coexist
   * rather than replace each other.
   */
  shadow: {
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  },

  /** `outline-none`, both halves. */
  outline: {
    "--ui-outline-style": "none",
    outlineStyle: "none",
  },

  /**
   * A forced-colours mode paints its own outline, so the ring is given room.
   *
   * `2px solid transparent` rather than `none`: the mode substitutes a system
   * colour for a transparent outline and removes nothing.
   */
  forcedColors: {
    "@media (forced-colors: active)": { outline: "2px solid transparent", outlineOffset: "2px" },
  },

  /** `transition-… duration-… ease-…`, with the theme's defaults. */
  transition: {
    transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
    transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  },

  /**
   * `select-none`, and the prefix it still needs.
   *
   * `-webkit-user-select` has no camel-cased spelling that survives `kebab`,
   * which is why it is quoted, and it is the half most likely to be forgotten.
   */
  noSelect: {
    "-webkit-user-select": "none",
    userSelect: "none",
  },
});
