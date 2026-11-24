/**
 * arc's building blocks: the treatments every arc component is composed from,
 * and what an app composes a one-off pattern from.
 *
 * One module per family, re-exported here. A treatment read through this
 * module folds as one read from its own module does, and the stylesheet that
 * travels with the fold is that family's, so an app carries the families it
 * uses rather than all of them. What `@barqjs/ui` already has (its `text`,
 * `box`, `ring`, `ringSlot`, `touch` groups, the `on` conditions and its
 * colour `tokens`) is imported from ui's own modules and composed, never
 * written again.
 */

export { bg, fg, tone } from "./colour.ts";
export { control } from "./control.ts";
export { focus } from "./focus.ts";
export { gap } from "./gap.ts";
export { interaction } from "./interaction.ts";
export { glyph, layout, plainList, square, truncate } from "./layout.ts";
export { motion } from "./motion.ts";
export { panel } from "./panel.ts";
export { place } from "./place.ts";
export { edge, elevation, rounded, surface } from "./surface.ts";
export { target } from "./target.ts";
export { motionTokens, radius, space, zIndex } from "./tokens.ts";
export { type } from "./type.ts";
