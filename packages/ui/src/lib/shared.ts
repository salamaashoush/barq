/**
 * The treatments more than one component wears, written once.
 *
 * The sheet was already deduplicated: an atom is one declaration, so
 * `box-shadow: var(--ui-inset-shadow), …` was one class however many components
 * asked for it. The SOURCE was not. That declaration was spelled out 52 times
 * across the forty-six files, `display: flex` 72, and changing a shared
 * treatment meant 52 edits with nothing to say whether the fifty-third had been
 * missed.
 *
 * A group is a name for a treatment. `createIn` folds it here, in this module,
 * and hands back plain strings, so composing one costs a merge over class names
 * rather than a second copy of any rule:
 *
 * ```ts
 * const ui = layer("barq.ui");
 * const input = ui(shared.border, shared.textSm, shared.focusRing, { width: "100%" });
 * ```
 *
 * Three things decide what belongs here.
 *
 * A group moves a WHOLE condition subtree or nothing. `:focus-visible` sets
 * `--ui-ring-color` and an `@supports` overrides it, and those two are ordered
 * by which was emitted last within the call; split across modules they would be
 * ordered by which module was imported first, and the `color-mix` would stop
 * applying. Kept together, they are emitted together and the pair is decided
 * where it always was.
 *
 * A group goes FIRST in the call, before the component's own declarations,
 * because merging keeps the last per property: a component that sets
 * `border-width` after `shared.border` still wins, which is what a shared
 * treatment has to allow.
 *
 * And the values are spelled out rather than named by a `const`, because the
 * compiler reads an object literal and a `const` is not one. Naming them would
 * take this file to the runtime and the whole group with it.
 */

import { createIn, firstThatWorks } from "@barqjs/css";

export const shared = createIn("barq.ui", {
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

  /** `transition-… duration-… ease-…`, with the theme's defaults. */
  transition: {
    transitionTimingFunction: "var(--ui-ease, var(--default-transition-timing-function))",
    transitionDuration: "var(--ui-duration, var(--default-transition-duration))",
  },

  /** `text-sm`, which carries a line height with it. */
  textSm: {
    fontSize: "var(--text-sm)",
    lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  },

  /** `font-medium`, and the custom property a descendant reads it back from. */
  fontMedium: {
    "--ui-font-weight": "var(--font-weight-medium)",
    fontWeight: "var(--font-weight-medium)",
  },

  /** `border`, whose style comes from the theme so a reset cannot take it. */
  border: {
    borderStyle: "var(--ui-border-style)",
    borderWidth: "1px",
  },

  /** `outline-none`, both halves. */
  outlineNone: {
    "--ui-outline-style": "none",
    outlineStyle: "none",
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

  /** The focus ring, on an element the browser focuses. */
  focusRing: {
    ":focus-visible": {
      borderColor: "var(--ring)",
      "--ui-ring-shadow":
        "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
      boxShadow:
        "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
      "--ui-ring-color": "var(--ring)",
      "@supports (color: color-mix(in lab, red, red))": {
        "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
      },
    },
  },

  /**
   * The same ring, on one `@barqjs/aria` marks.
   *
   * A component whose focus is managed rather than the browser's, a menu item
   * or a calendar day, carries `data-focus-visible` and never matches the
   * pseudo-class.
   */
  focusRingData: {
    "[data-focus-visible]": {
      borderColor: "var(--ring)",
      "--ui-ring-shadow":
        "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
      boxShadow:
        "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
      "--ui-ring-color": "var(--ring)",
      "@supports (color: color-mix(in lab, red, red))": {
        "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
      },
    },
  },

  /** `aria-invalid:` — the destructive border and ring, light and dark. */
  invalidRing: {
    '[aria-invalid="true"]': {
      borderColor: "var(--destructive)",
      "--ui-ring-color": "var(--destructive)",
      "@supports (color: color-mix(in lab, red, red))": {
        "--ui-ring-color": "color-mix(in oklab, var(--destructive) 20%, transparent)",
      },
    },
  },

  /** The dark half of it, which is a different mix and a separate opt-in. */
  invalidRingDark: {
    ':is(.dark *)[aria-invalid="true"]': {
      "--ui-ring-color": "var(--destructive)",
      "@supports (color: color-mix(in lab, red, red))": {
        "--ui-ring-color": "color-mix(in oklab, var(--destructive) 40%, transparent)",
      },
    },
  },

  /** The same, keyed off the attribute `@barqjs/aria` writes. */
  invalidRingSlot: {
    "[data-invalid]": {
      borderColor: "var(--destructive)",
      "--ui-ring-color": "var(--destructive)",
      "@supports (color: color-mix(in lab, red, red))": {
        "--ui-ring-color": "color-mix(in oklab, var(--destructive) 20%, transparent)",
      },
    },
  },

  invalidRingSlotDark: {
    ":is(.dark *)[data-invalid]": {
      "--ui-ring-color": "var(--destructive)",
      "@supports (color: color-mix(in lab, red, red))": {
        "--ui-ring-color": "color-mix(in oklab, var(--destructive) 40%, transparent)",
      },
    },
  },

  /** An icon inside a control: not a press target, and not squeezed. */
  svgStatic: {
    "& svg": { pointerEvents: "none", flexShrink: "0" },
  },

  /**
   * `size-4` on an icon that has not been given a size of its own.
   *
   * shadcn's `[&_svg:not([class*='size-'])]:size-4`, which is how a caller
   * overrides it: any `size-*` class on the icon takes the rule out.
   */
  svgSize: {
    '& svg:not([class*="size-"])': {
      width: "calc(var(--spacing) * 4)",
      height: "calc(var(--spacing) * 4)",
    },
  },

  /** And the colour, on the same terms. */
  svgMuted: {
    '& svg:not([class*="text-"])': { color: "var(--muted-foreground)" },
  },

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

  /**
   * A forced-colours mode paints its own outline, so the ring is given room.
   *
   * `2px solid transparent` rather than `none`: the mode substitutes a system
   * colour for a transparent outline and removes nothing.
   */
  forcedColors: {
    "@media (forced-colors: active)": { outline: "2px solid transparent", outlineOffset: "2px" },
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
