import { box } from "@barqjs/ui/shared-box";
import { ring } from "@barqjs/ui/shared-ring";
import { ringSlot } from "@barqjs/ui/shared-ring-slot";
import { tokens } from "@barqjs/ui/theme/tokens";

import { arcLayer as arc } from "../layer.ts";

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
      borderColor: tokens.ring,
      boxShadow: "0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent)",
    },
  }),
  /** An outline inside the box on keyboard focus: a scrolling region a Tab reaches. */
  outline: arc({
    ":focus-visible": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: tokens.ring,
      outlineOffset: "-2px",
    },
  }),
  /** Takes the browser's own outline away, for a part that draws a ring instead. */
  none: arc(box.outline),
};
