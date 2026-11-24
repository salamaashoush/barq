/**
 * Room for a finger.
 *
 * Under a coarse pointer an interactive control reaches 44px, which is the
 * smallest target WCAG 2.5.5 and both phone platforms ask for. A mouse is
 * precise, so under a fine pointer nothing here applies and desktop sizing is
 * what the component wrote.
 *
 * Two shapes, because a control either has a pseudo-element to spare or it
 * does not. `target` grows the box itself: a button, a field, a menu item, a
 * tab. `hitArea` grows the press area a control already draws past its paint
 * (the checkbox, the radio and the switch each carry an absolutely placed
 * `::after` for exactly this), so the 16px box keeps its size and the area a
 * finger can press reaches 44px around it. Growing a pseudo-element rather
 * than the box everywhere was weighed and rejected: placing one needs
 * `position: relative`, and a control the component positions itself (a
 * sheet's close button) would move.
 *
 * The condition is `on.coarse` from `conditions.ts`, spelled out
 * because this package folds every style object in its own module.
 */

import { layer } from "@barqjs/css";

const ui = layer("barq.ui");

export const touch = ui.create({
  target: {
    "@media (pointer: coarse)": {
      minBlockSize: "2.75rem",
      minInlineSize: "2.75rem",
    },
  },

  hitArea: {
    "@media (pointer: coarse)": {
      "::after": {
        insetInline: "min(calc(var(--spacing) * -3), calc((100% - 2.75rem) / 2))",
        insetBlock: "min(calc(var(--spacing) * -2), calc((100% - 2.75rem) / 2))",
      },
    },
  },
});
