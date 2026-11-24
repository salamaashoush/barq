import { arcLayer as arc } from "../layer.ts";

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
  /** No padding: a part whose content sets its size. */
  unpadded: arc({ padding: "0px" }),
  /** Over its positioned parent and out of the way: the pointer passes through it and it is never selected. */
  passive: arc({ position: "absolute", pointerEvents: "none", userSelect: "none" }),
  /** An `::after` drawn over its positioned parent, for a part that adds a mark or a hit area of its own. */
  afterLayer: arc({ "::after": { content: '""', position: "absolute" } }),
};
