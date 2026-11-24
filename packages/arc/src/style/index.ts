/**
 * arc's building blocks: the treatments every arc component is composed from,
 * and what an app composes a one-off pattern from.
 *
 * One module on purpose. The compiler folds a group through an import by
 * reading the module that DECLARES it, and a re-export is not a declaration,
 * so a barrel of `export … from` would leave every call an app writes against
 * it to the runtime. Everything here is declared here; what `@barqjs/ui`
 * already has (its `text`, `box`, `ring`, `ringSlot`, `icon`, `when`, `touch`
 * and `contrast` groups, and the `on` conditions) is imported from ui's own
 * modules and composed, never written again.
 */

import { box } from "@barqjs/ui/shared-box";
import { on } from "@barqjs/ui/conditions";
import { ring } from "@barqjs/ui/shared-ring";
import { ringSlot } from "@barqjs/ui/shared-ring-slot";
import { text } from "@barqjs/ui/shared-text";

import { arcLayer as arc } from "../layer.ts";

export interface Space {
  readonly x0: string;
  readonly x0_5: string;
  readonly x1: string;
  readonly x1_5: string;
  readonly x2: string;
  readonly x2_5: string;
  readonly x3: string;
  readonly x3_5: string;
  readonly x4: string;
  readonly x5: string;
  readonly x6: string;
  readonly x8: string;
  readonly x9: string;
  readonly x10: string;
  readonly x11: string;
  readonly x12: string;
  readonly x14: string;
  readonly x16: string;
}

/**
 * The spacing scale, as multiples of ui's `--spacing`: `space.x4` is
 * `calc(var(--spacing) * 4)`. Density is that one token, so every value here
 * follows a `data-density` region.
 *
 * Keys are identifiers because the compiler folds a token object's members
 * through an import only when they are, and only from an object it can read
 * whole, which is why the type is written out rather than inferred.
 */
export const space: Space = {
  x0: "0px",
  x0_5: "calc(var(--spacing) * 0.5)",
  x1: "calc(var(--spacing) * 1)",
  x1_5: "calc(var(--spacing) * 1.5)",
  x2: "calc(var(--spacing) * 2)",
  x2_5: "calc(var(--spacing) * 2.5)",
  x3: "calc(var(--spacing) * 3)",
  x3_5: "calc(var(--spacing) * 3.5)",
  x4: "calc(var(--spacing) * 4)",
  x5: "calc(var(--spacing) * 5)",
  x6: "calc(var(--spacing) * 6)",
  x8: "calc(var(--spacing) * 8)",
  x9: "calc(var(--spacing) * 9)",
  x10: "calc(var(--spacing) * 10)",
  x11: "calc(var(--spacing) * 11)",
  x12: "calc(var(--spacing) * 12)",
  x14: "calc(var(--spacing) * 14)",
  x16: "calc(var(--spacing) * 16)",
};

export interface Radius {
  readonly xs: string;
  readonly sm: string;
  readonly md: string;
  readonly lg: string;
  readonly xl: string;
  readonly full: string;
}

/** Corners, as steps of the theme's `--radius`. */
export const radius: Radius = {
  xs: "calc(var(--radius) * 0.5)",
  sm: "calc(var(--radius) * 0.6)",
  md: "var(--radius)",
  lg: "calc(var(--radius) * 1.4)",
  xl: "calc(var(--radius) * 2)",
  full: "9999px",
};

export interface Motion {
  readonly fast: string;
  readonly base: string;
  readonly slow: string;
  readonly standard: string;
  readonly emphasized: string;
}

/** Durations and the two curves, as arc's theme tokens. */
export const motionTokens: Motion = {
  fast: "var(--duration-fast, 150ms)",
  base: "var(--duration-base, 200ms)",
  slow: "var(--duration-slow, 300ms)",
  standard: "var(--ease-standard, ease)",
  emphasized: "var(--ease-emphasized, ease-out)",
};

export interface Stacking {
  readonly sticky: string;
  readonly header: string;
  readonly popover: string;
  readonly overlay: string;
  readonly toast: string;
}

/** Stacking, as arc's theme tokens with the values they default to. */
export const zIndex: Stacking = {
  sticky: "var(--z-sticky, 10)",
  header: "var(--z-header, 20)",
  popover: "var(--z-popover, 40)",
  overlay: "var(--z-overlay, 50)",
  toast: "var(--z-toast, 60)",
};

/** Flow: rows, columns and what a child does inside one. */
export const layout = arc.create({
  /** Children side by side, centred on the cross axis. */
  row: { display: "flex", alignItems: "center" },
  /** The same, inside a line of text. */
  inlineRow: { display: "inline-flex", alignItems: "center" },
  column: { display: "flex", flexDirection: "column" },
  /** Centred both ways. */
  centre: { display: "flex", alignItems: "center", justifyContent: "center" },
  inlineCentre: { display: "inline-flex", alignItems: "center", justifyContent: "center" },
  between: { justifyContent: "space-between" },
  end: { justifyContent: "flex-end" },
  wrap: { flexWrap: "wrap" },
  /** Takes the room left in its row or column. */
  grow: { flex: "1" },
  /** Grows into the room left, from its own content size. */
  growAuto: { flex: "1 1 auto" },
  noShrink: { flexShrink: "0" },
  /** Pushed to the end of its row, whatever the reading direction. */
  pushEnd: { marginInlineStart: "auto" },
  /** Lets a flex or grid child shrink below its content, so text inside can truncate. */
  minZero: { minWidth: "0px" },
  minZeroBlock: { minHeight: "0px" },
  fill: { width: "100%" },
  /** Cut at the box with an ellipsis, where text that does not wrap runs out. */
  clip: { overflow: "hidden", textOverflow: "ellipsis" },
  nowrap: { whiteSpace: "nowrap" },
  clamp2: {
    display: "-webkit-box",
    overflow: "hidden",
    "-webkit-box-orient": "vertical",
    "-webkit-line-clamp": "2",
  },
  clamp3: {
    display: "-webkit-box",
    overflow: "hidden",
    "-webkit-box-orient": "vertical",
    "-webkit-line-clamp": "3",
  },
  /** An element's own margin gone: a heading or a paragraph placed by its parent's gap. */
  flush: { margin: "0" },
  /** A query container, for what is laid out by `on.cq*`. */
  container: { containerType: "inline-size" },
  relative: { position: "relative" },
});

/** One line, cut with an ellipsis. */
export const truncate = arc(layout.clip, layout.nowrap);

/** An icon a part draws beside its text, sized and kept from shrinking. */
export const glyph = arc.create({
  sm: { "& > svg": { width: space.x3_5, height: space.x3_5, flexShrink: "0" } },
  md: { "& > svg": { width: space.x4, height: space.x4, flexShrink: "0" } },
});

/** Space between children, on the spacing scale. */
export const gap = arc.create({
  0: { gap: space.x0 },
  0.5: { gap: space.x0_5 },
  1: { gap: space.x1 },
  1.5: { gap: space.x1_5 },
  2: { gap: space.x2 },
  3: { gap: space.x3 },
  4: { gap: space.x4 },
  5: { gap: space.x5 },
  6: { gap: space.x6 },
  8: { gap: space.x8 },
  10: { gap: space.x10 },
  12: { gap: space.x12 },
});

/** Text colour by role, on ui's tokens and arc's. */
export const fg = arc.create({
  default: { color: "var(--foreground)" },
  muted: { color: "var(--muted-foreground)" },
  faint: { color: "var(--faint-foreground)" },
  link: { color: "var(--link)" },
  danger: { color: "var(--destructive)" },
  inherit: { color: "inherit" },
  /** The foreground of the tone an ancestor chose with `tone.*`. */
  tone: { color: "var(--arc-tone-foreground)" },
  /** The tone itself, for a mark drawn in it: a dot, a line. */
  toneBase: { color: "var(--arc-tone)" },
  card: { color: "var(--card-foreground)" },
  popover: { color: "var(--popover-foreground)" },
});

/** A number or a title at display size, which `type.title` and `type.stat` share. */
const display = arc({
  margin: "0",
  fontSize: "var(--text-2xl)",
  lineHeight: "var(--text-2xl--line-height)",
  fontWeight: "var(--font-weight-semibold)",
  letterSpacing: "var(--tracking-tight)",
});

const numeric = arc({ fontVariantNumeric: "tabular-nums" });

const caption = arc({ fontSize: "var(--text-xs)", lineHeight: "var(--text-xs--line-height)" });

/**
 * Text by what it is rather than by its size.
 *
 * `body`, `label` and the rest start from ui's `text.sm`, `text.medium` and
 * `text.heading`, so a label in an arc table and one in a ui field are one
 * class.
 */
export const type = {
  /** A page's title. */
  title: arc(text.heading, display, { textWrap: "balance" }),
  /** A section's or a panel's title. */
  heading: arc(text.heading, {
    margin: "0",
    fontSize: "var(--text-lg)",
    lineHeight: "var(--text-lg--line-height)",
    fontWeight: "var(--font-weight-semibold)",
  }),
  subheading: arc(text.medium, {
    margin: "0",
    fontSize: "var(--text-base)",
    lineHeight: "var(--text-base--line-height)",
  }),
  /** Running text, wrapped for reading. */
  body: arc(text.sm, { margin: "0", textWrap: "pretty" }),
  /** What names a control or a value. */
  label: arc(text.sm, text.medium),
  /** Small print beside something: a count, a time, a hint. */
  meta: arc(caption, fg.muted),
  caption: arc(caption),
  /** One number that matters. */
  stat: arc(display, numeric),
  /** Figures that line up in a column or hold still while they change. */
  numeric: arc(numeric),
  mono: arc({ fontFamily: "var(--font-mono)" }),
  sans: arc({ fontFamily: "var(--font-sans)" }),
  /** Sizes and weights on their own, for a part whose role is set elsewhere. */
  sm: arc(text.sm),
  xs: arc({ fontSize: "var(--text-xs)" }),
  medium: arc(text.medium),
  strong: arc({ fontWeight: "var(--font-weight-semibold)" }),
  normal: arc({ fontWeight: "var(--font-weight-normal)" }),
};

/** Fill by role. */
export const bg = arc.create({
  page: { backgroundColor: "var(--background)" },
  card: { backgroundColor: "var(--card)" },
  popover: { backgroundColor: "var(--popover)" },
  sunken: { backgroundColor: "var(--sunken)" },
  muted: { backgroundColor: "var(--muted)" },
  transparent: { backgroundColor: "transparent" },
  /** The subtle fill of the tone an ancestor chose. */
  tone: { backgroundColor: "var(--arc-tone-subtle)" },
  toneSolid: { backgroundColor: "var(--arc-tone)" },
});

/**
 * A tone for everything under it: the three custom properties `fg.tone`,
 * `fg.toneBase` and `bg.tone` read, so a part picks a tone once and its
 * children draw in it.
 */
export const tone = arc.create({
  success: {
    "--arc-tone": "var(--success)",
    "--arc-tone-foreground": "var(--success-foreground)",
    "--arc-tone-subtle": "var(--success-subtle)",
  },
  warning: {
    "--arc-tone": "var(--warning)",
    "--arc-tone-foreground": "var(--warning-foreground)",
    "--arc-tone-subtle": "var(--warning-subtle)",
  },
  danger: {
    "--arc-tone": "var(--danger)",
    "--arc-tone-foreground": "var(--danger-foreground)",
    "--arc-tone-subtle": "var(--danger-subtle)",
  },
  info: {
    "--arc-tone": "var(--info)",
    "--arc-tone-foreground": "var(--info-foreground)",
    "--arc-tone-subtle": "var(--info-subtle)",
  },
  neutral: {
    "--arc-tone": "var(--neutral)",
    "--arc-tone-foreground": "var(--neutral-foreground)",
    "--arc-tone-subtle": "var(--neutral-subtle)",
  },
});

/** Edges, each in the theme's border colour. */
export const edge = {
  /** All four, on ui's `box.border`. */
  all: arc(box.border, { borderColor: "var(--border)" }),
  /** The width and the colour, keeping whatever style the element has: a dashed frame stays dashed. */
  frame: arc({ borderWidth: "1px", borderColor: "var(--border)" }),
  /** An input's edge, which is a different token. */
  input: arc(box.border, { borderColor: "var(--input)" }),
  top: arc({
    borderBlockStartWidth: "1px",
    borderBlockStartStyle: "solid",
    borderBlockStartColor: "var(--border)",
  }),
  bottom: arc({
    borderBlockEndWidth: "1px",
    borderBlockEndStyle: "solid",
    borderBlockEndColor: "var(--border)",
  }),
  start: arc({
    borderInlineStartWidth: "1px",
    borderInlineStartStyle: "solid",
    borderInlineStartColor: "var(--border)",
  }),
  none: arc({ borderWidth: "0px" }),
};

/** Corners. */
export const rounded = arc.create({
  xs: { borderRadius: radius.xs },
  sm: { borderRadius: radius.sm },
  md: { borderRadius: radius.md },
  lg: { borderRadius: radius.lg },
  xl: { borderRadius: radius.xl },
  full: { borderRadius: radius.full },
  inherit: { borderRadius: "inherit" },
});

/** Lift off the page. */
export const elevation = arc.create({
  raised: { boxShadow: "0 10px 15px -3px var(--shadow-color, rgb(0 0 0 / 0.1))" },
});

/** Surfaces: a box with a fill, an edge and a corner that belong together. */
export const surface = {
  /** A card's: its fill and text, an edge, the large corner. */
  card: arc(edge.all, rounded.lg, {
    backgroundColor: "var(--card)",
    color: "var(--card-foreground)",
  }),
  /** Below the page: a well, a code block, a table's header. */
  sunken: arc({ backgroundColor: "var(--sunken, var(--muted))" }),
  /** The edge alone, in the large corner. */
  bordered: arc(edge.all, rounded.lg),
  /** Over the page: a popover's fill, an edge and a shadow. */
  elevated: arc(edge.all, rounded.lg, bg.popover, fg.popover, elevation.raised),
  /** The scrim behind a modal. */
  overlay: arc({ backgroundColor: "var(--overlay)" }),
};

/**
 * Focus, reusing ui's rings: `focus.visible` for an element the browser
 * focuses, `focus.slot` for one `@barqjs/aria` marks, and `focus.inset` for
 * a cell or a row whose ring has to sit inside its box.
 */
export const focus = {
  visible: arc(ring.focus),
  slot: arc(ringSlot.focus),
  inset: arc(ringSlot.focus, { "--ui-ring-inset": "inset" }),
  /** A box that rings while anything in it has focus: a field made of parts. */
  within: arc({
    ":focus-within": {
      borderColor: "var(--ring)",
      boxShadow: "0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent)",
    },
  }),
  /** Takes the browser's own outline away, for a part that draws a ring instead. */
  none: arc(box.outline),
};

/** How a part answers a pointer and a selection. */
export const interaction = arc.create({
  /** A tint under a resting pointer, where one can rest. */
  hover: {
    "@media (hover: hover)": {
      "[data-hovered]": { backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)" },
    },
  },
  /** The same tint while focus is somewhere inside it. */
  focusWithin: {
    "[data-focus-visible-within]": {
      backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
    },
  },
  selected: { "[data-selected]": { backgroundColor: "var(--muted)" } },
  /** Text that brightens under a resting pointer. */
  hoverText: {
    "@media (hover: hover)": { ":hover": { color: "var(--foreground)" } },
  },
  pressable: { cursor: "pointer" },
  invalid: { "[data-invalid]": { borderColor: "var(--destructive)" } },
});

/** The quick duration, gone under reduced motion, on the standard curve. */
const quick = arc({
  transitionDuration: { default: "var(--duration-fast, 150ms)", [on.reducedMotion]: "0s" },
  transitionTimingFunction: "var(--ease-standard, ease)",
});

/**
 * Movement, which stops under reduced motion: the duration goes to nothing
 * rather than the transition going away, so a state still lands.
 */
export const motion = {
  colours: arc(quick, { transitionProperty: "color, background-color, border-color, box-shadow" }),
  transform: arc(quick, { transitionProperty: "rotate, scale, translate, transform" }),
  /** For something arriving: the emphasized curve, which decelerates into place. */
  enter: arc({
    transitionDuration: { default: "var(--duration-base, 200ms)", [on.reducedMotion]: "0s" },
    transitionTimingFunction: "var(--ease-emphasized, ease-out)",
  }),
};

/**
 * Room for a finger, arc's way: ui's `touch` grows a control; these place a
 * part that is not one of ui's controls.
 */
export const target = arc.create({
  /** At least 24px under a fine pointer and 44px under a coarse one. */
  size: {
    minBlockSize: { default: "1.5rem", [on.coarse]: "2.75rem" },
    minInlineSize: { default: "1.5rem", [on.coarse]: "2.75rem" },
  },
});
