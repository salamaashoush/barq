import { arcLayer as arc } from "../layer.ts";
import { gap } from "./gap.ts";
import { layout } from "./layout.ts";
import { edge } from "./surface.ts";

/** The inside of a sheet or a dialog. */
export const panel = {
  /** Its body: the room left, scrolling by itself, the page not scrolled past it. */
  body: arc(layout.column, layout.minZeroBlock, layout.grow, gap[4], {
    overflowY: "auto",
    overscrollBehavior: "contain",
  }),
  /** Its foot of actions: in a row from the end, clear of a phone's home indicator. */
  footer: arc(layout.wrap, layout.end, edge.top, {
    flexDirection: "row",
    paddingBlockEnd: "max(calc(var(--spacing) * 4), env(safe-area-inset-bottom))",
  }),
};
