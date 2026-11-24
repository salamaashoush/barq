import { tokens } from "@barqjs/ui/theme/tokens";

import { arcLayer as arc } from "../layer.ts";

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
  selected: { "[data-selected]": { backgroundColor: tokens.muted } },
  /** Text that brightens under a resting pointer. */
  hoverText: {
    "@media (hover: hover)": { ":hover": { color: tokens.foreground } },
  },
  pressable: { cursor: "pointer" },
  /** A part a pointer or a finger drags: the grab cursor, and no scrolling or zooming under the finger. */
  draggable: { cursor: "grab", touchAction: "none" },
  /** A column's edge a pointer or a finger drags to resize it, and no scrolling under the finger. */
  resize: { cursor: "col-resize", touchAction: "none" },
  invalid: { "[data-invalid]": { borderColor: tokens.destructive } },
});
