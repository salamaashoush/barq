import { box } from "@barqjs/ui/shared-box";
import { tokens } from "@barqjs/ui/theme/tokens";

import { arcLayer as arc } from "../layer.ts";
import { bg, fg } from "./colour.ts";
import { radius } from "./tokens.ts";

/** Edges, each in the theme's border colour. */
export const edge = {
  /** All four, on ui's `box.border`. */
  all: arc(box.border, { borderColor: tokens.border }),
  /** The width and the colour, keeping whatever style the element has: a dashed frame stays dashed. */
  frame: arc({ borderWidth: "1px", borderColor: tokens.border }),
  /** An input's edge, which is a different token. */
  input: arc(box.border, { borderColor: tokens.input }),
  top: arc({
    borderBlockStartWidth: "1px",
    borderBlockStartStyle: "solid",
    borderBlockStartColor: tokens.border,
  }),
  bottom: arc({
    borderBlockEndWidth: "1px",
    borderBlockEndStyle: "solid",
    borderBlockEndColor: tokens.border,
  }),
  start: arc({
    borderInlineStartWidth: "1px",
    borderInlineStartStyle: "solid",
    borderInlineStartColor: tokens.border,
  }),
  none: arc({ borderWidth: "0px" }),
  /** In the tone an ancestor chose with `tone.*`, for a box drawn in it. */
  tone: arc({ borderColor: "var(--arc-tone)" }),
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
  card: arc(edge.all, rounded.lg, bg.card, fg.card),
  /** Below the page: a well, a code block, a table's header. */
  sunken: arc({ backgroundColor: "var(--sunken, var(--muted))" }),
  /** The edge alone, in the large corner. */
  bordered: arc(edge.all, rounded.lg),
  /** Over the page: a popover's fill, an edge and a shadow. */
  elevated: arc(edge.all, rounded.lg, bg.popover, fg.popover, elevation.raised),
  /** Over a picture or a video: a dark scrim with white text, a caption or a control on a call's tile. */
  onMedia: arc({ backgroundColor: "color-mix(in oklab, black 55%, transparent)", color: "white" }),
  /** The scrim behind a modal. */
  overlay: arc({ backgroundColor: "var(--overlay)" }),
};
