import { arcLayer as arc } from "../layer.ts";
import { edge, gap, layout } from "../style/index.ts";

/** A sheet's or a dialog's body: the room left, scrolling by itself, the page not scrolled past it. */
export const panelBody = arc(layout.column, layout.minZeroBlock, layout.grow, gap[4], {
  overflowY: "auto",
  overscrollBehavior: "contain",
});

/** Its foot of actions: in a row from the end, clear of a phone's home indicator. */
export const panelFooter = arc(layout.wrap, layout.end, edge.top, {
  flexDirection: "row",
  paddingBlockEnd: "max(calc(var(--spacing) * 4), env(safe-area-inset-bottom))",
});
