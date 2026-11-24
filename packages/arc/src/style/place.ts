import { arcLayer as arc } from "../layer.ts";
import { space, zIndex } from "./tokens.ts";

/**
 * Where a part sits and how big it is, for the arrangements several parts
 * share: a layer over its positioned parent, a control centred on its edge,
 * a box that takes the whole of its parent or the whole screen.
 */
export const place = {
  /** Over the whole of its positioned parent: a placeholder, a fallback, a centred figure. */
  cover: arc({ position: "absolute", inset: "0" }),
  /** Held halfway down its positioned parent: a control at one edge of a field or a stage. */
  middle: arc({ position: "absolute", top: "50%", translate: "0 -50%" }),
  /** The whole of its parent's box, both ways: an image in its frame. */
  fill: arc({ width: "100%", height: "100%" }),
  /** A block across its parent: an SVG or an image laid out as a line. */
  block: arc({ display: "block", width: "100%" }),
  /** The whole screen, whatever its toolbars: a full-screen dialog. */
  screen: arc({ width: "100vw", maxWidth: "100vw", height: "100dvh", maxHeight: "100dvh" }),
  /** Across its positioned parent, at a height the caller sets: a row a list places itself. */
  across: arc({ position: "absolute", insetInline: "0" }),
  /** The room a cell or a line of text keeps from its edges: a table's cell, an editor's text. */
  padded: arc({ paddingInline: space.x3, paddingBlock: space.x2 }),
  /** The same across a thin strip: a status line, a header above an editor. */
  paddedStrip: arc({ paddingInline: space.x3, paddingBlock: space.x1_5 }),
  /** No padding: a part whose content sets its size. */
  unpadded: arc({ padding: "0px" }),
  /** Over its positioned parent and out of the way: the pointer passes through it and it is never selected. */
  passive: arc({ position: "absolute", pointerEvents: "none", userSelect: "none" }),
  /** Kept a step in from the bottom corner at the end of the line: a jump button, a floating window. */
  endCorner: arc({ insetBlockEnd: space.x4, insetInlineEnd: space.x4 }),
  /** Fixed over the whole page, on the overlay's layer: a spotlight, a floating window. */
  floating: arc({ position: "fixed", zIndex: zIndex.overlay }),
  /** An `::after` drawn over its positioned parent, for a part that adds a mark or a hit area of its own. */
  afterLayer: arc({ "::after": { content: '""', position: "absolute" } }),
};
