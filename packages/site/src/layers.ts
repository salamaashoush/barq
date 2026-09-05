/**
 * The order this site's rules cascade in, and nothing else.
 *
 * `@barqjs/ui` declares the same order in its own `theme/layers.ts`, and in a
 * single sheet that is enough. A code-split build is not a single sheet: the
 * statement lands in whichever chunk that module was assigned to, and the
 * browser fixes a layer's position at its FIRST appearance across all of them.
 * A chunk carrying `@layer barq.ui{…}` linked ahead of it therefore put the
 * components in front of the reset, and Tailwind's preflight — a later layer —
 * beat every one of them. Buttons lost their padding and their background.
 *
 * ALONE IN THIS FILE, which is the part that is not obvious. Lightning CSS
 * rewrites an order statement to name only the layers that have no block in the
 * same file, on the reasoning that a block declares its own position — sound
 * within one sheet, wrong across several. Beside the theme it came out as
 * `@layer barq.reset,barq.base;` with `barq.ui` and `barq.style` dropped. With
 * no block to attribute, there is nothing for it to remove.
 */

import { globalCss } from "@barqjs/css";

globalCss`
@layer barq.reset, barq.base, barq.theme, barq.ui, barq.style;
`;
