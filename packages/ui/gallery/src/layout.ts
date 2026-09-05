/**
 * The classes more than one part of the create page wears.
 *
 * A module of its own rather than exports from `customizer.tsx`, because the
 * footer's five controls each live in their own file — as they do upstream —
 * and importing a class from the thing that renders them would make a cycle out
 * of what is only a shared look.
 */

import { layer } from "@barqjs/css";

const ui = layer("barq.ui");

/**
 * Every footer button: transparent, tight, and not animated.
 *
 * `transition-none` is upstream's and it is deliberate: five buttons in a
 * column all crossfading their background when the theme changes reads as the
 * page lagging, where an instant change reads as the page having changed.
 */
export const footerButton = ui({
  touchAction: "manipulation",
  backgroundColor: "transparent",
  paddingInline: "calc(var(--spacing) * 2)",
  paddingBlock: "0px",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  transitionProperty: "none",
  userSelect: "none",
  "@media (hover: hover)": {
    "&:hover": { backgroundColor: "var(--muted)" },
  },
});

/**
 * The three that share the row on a narrow screen.
 *
 * Capped rather than equal: on a phone the row is Copy / Open / Shuffle /
 * Search / Reset, and letting the copy button take the space it wants pushes
 * the rest off the edge.
 */
export const narrowFooterButton = ui({
  maxWidth: "calc(var(--spacing) * 20)",
  minWidth: "0px",
  flex: "1",
  "@media (width >= 40rem)": { maxWidth: "none" },
  "@media (width >= 48rem)": { flex: "none" },
});

/** The one that keeps the rest of the row: the command it shows is the long one. */
export const growingFooterButton = ui({
  minWidth: "0px",
  flex: "1",
  "@media (width >= 48rem)": { flex: "none" },
});

/** A label that gives up rather than pushing its button wider. */
export const truncated = ui({
  display: "block",
  minWidth: "0px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

/**
 * A full-page block, filling the preview rather than the window.
 *
 * shadcn's page-level blocks are `min-h-svh`, and inside their `<iframe>` that
 * IS the preview: the frame's viewport is its box. Rendered in place, `svh`
 * still means the window, so a sidebar came out 951px tall in a 921px preview
 * and its footer sat 30px below the fold.
 *
 * A viewport UNIT is the one thing containment cannot redirect — `contain:
 * layout` fixes where a fixed element resolves, and a container query fixes
 * what a media query measures, but `svh` is a length and always means the
 * window. So the block is told its height instead.
 */
export const blockFillsPreview = ui({
  minHeight: "100%",
  height: "100%",
});
