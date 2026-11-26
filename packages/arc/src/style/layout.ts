import { on } from "@barqjs/ui/conditions";

import { arcLayer as arc } from "../layer.ts";
import { space, zIndex } from "./tokens.ts";

/** The single declarations the layout treatments are made of. */
const flow = arc.create({
  flex: { display: "flex" },
  inlineFlex: { display: "inline-flex" },
  alignCentre: { alignItems: "center" },
  justifyCentre: { justifyContent: "center" },
  column: { flexDirection: "column" },
  lineClamp: { display: "-webkit-box", overflow: "hidden", "-webkit-box-orient": "vertical" },
});

/** Flow: rows, columns and what a child does inside one. */
export const layout = {
  /** Children side by side, centred on the cross axis. */
  row: arc(flow.flex, flow.alignCentre),
  /** The same, inside a line of text. */
  inlineRow: arc(flow.inlineFlex, flow.alignCentre),
  column: arc(flow.flex, flow.column),
  /** Centred both ways. */
  centre: arc(flow.flex, flow.alignCentre, flow.justifyCentre),
  inlineCentre: arc(flow.inlineFlex, flow.alignCentre, flow.justifyCentre),
  between: arc({ justifyContent: "space-between" }),
  end: arc({ justifyContent: "flex-end" }),
  wrap: arc({ flexWrap: "wrap" }),
  /** Takes the room left in its row or column. */
  grow: arc({ flex: "1" }),
  /** Grows into the room left, from its own content size. */
  growAuto: arc({ flex: "1 1 auto" }),
  noShrink: arc({ flexShrink: "0" }),
  /** Pushed to the end of its row, whatever the reading direction. */
  pushEnd: arc({ marginInlineStart: "auto" }),
  /** Lets a flex or grid child shrink below its content, so text inside can truncate. */
  minZero: arc({ minWidth: "0px" }),
  minZeroBlock: arc({ minHeight: "0px" }),
  fill: arc({ width: "100%" }),
  /** Cut at the box with an ellipsis, where text that does not wrap runs out. */
  clip: arc({ overflow: "hidden", textOverflow: "ellipsis" }),
  nowrap: arc({ whiteSpace: "nowrap" }),
  clamp2: arc(flow.lineClamp, { "-webkit-line-clamp": "2" }),
  clamp3: arc(flow.lineClamp, { "-webkit-line-clamp": "3" }),
  /** An element's own margin gone: a heading or a paragraph placed by its parent's gap. */
  flush: arc({ margin: "0" }),
  /** One grid track as wide as its parent and no wider, so a long line inside wraps or scrolls in place. */
  track: arc({ display: "grid", gridTemplateColumns: "minmax(0, 1fr)" }),
  /** A query container, for what is laid out by `on.cq*`. */
  container: arc({ containerType: "inline-size" }),
  /** Left out until its query container reaches the `sm` step: a row's secondary detail. */
  fromCqSm: arc({ display: "none", [on.cqSm]: { display: "block" } }),
  /** Scrolls by itself along the block axis, the page not scrolled past it. */
  scrollBlock: arc({ overflowY: "auto", overscrollBehavior: "contain" }),
  /** Scrolls sideways by itself with no bar drawn: a strip of tabs or stages wider than its box. */
  scrollInline: arc({ overflowX: "auto", scrollbarWidth: "none" }),
  relative: arc({ position: "relative" }),
  /** Held at the top of its scroller, over what scrolls under it. */
  sticky: arc({ position: "sticky", zIndex: zIndex.sticky }),
  /** Centred in its parent's width, no wider than the parent. */
  centred: arc({ marginInline: "auto", width: "100%" }),
};

/** One line, cut with an ellipsis. */
export const truncate = arc(layout.clip, layout.nowrap);

/** An icon a part draws beside its text, sized and kept from shrinking. */
export const glyph = arc.create({
  sm: { "& > svg": { width: space.x3_5, height: space.x3_5, flexShrink: "0" } },
  md: { "& > svg": { width: space.x4, height: space.x4, flexShrink: "0" } },
});

/**
 * A square on the spacing scale, for a part drawn at a fixed size: a swatch,
 * a star, a thumb, an icon button that is not one of ui's.
 */
export const square = arc.create({
  x2: { width: space.x2, height: space.x2 },
  x4: { width: space.x4, height: space.x4 },
  x5: { width: space.x5, height: space.x5 },
  x6: { width: space.x6, height: space.x6 },
  x8: { width: space.x8, height: space.x8 },
});

/** A `<ul>` or `<ol>` laid out by its parent: no bullets, no indent, no margin. */
export const plainList = arc(layout.flush, { padding: "0px", listStyle: "none" });
