/**
 * This package's declarations, one class each.
 *
 * Every rule here used to be a `css` block: one class holding a slot's whole
 * look, which meant a declaration as ordinary as `border-radius: calc(var(--radius) - 2px)`
 * was written into forty different classes. Measured across the package, 1,948
 * declarations collapsed to 433 distinct ones. An atom is one declaration, so
 * they are shared by construction, and an application writing its own component
 * with the same declaration lands on the same class.
 *
 * Four things about it are load-bearing.
 *
 * `layer("barq.ui")` and not `atoms`, because of what a design system's rules
 * are FOR. An atom is unlayered on purpose, so that an application's own reset
 * cannot beat it; a component library wants exactly the opposite, and
 * `@layer barq.ui` is what lets a caller's unlayered rule win without
 * `!important` and without counting specificity.
 *
 * Every module declares its own `ui`, and that is the compiler's requirement
 * rather than a style: it reads the layer as a literal in the module that names
 * it, so a `ui` imported from here would leave all 192 calls to the runtime and
 * take the whole stylesheet into the JS bundle with them. This one is for the
 * merges the runtime does anyway, in `slot.ts` and in `variants`.
 *
 * Merging is the other half. Concatenating leaves the order the rules happen to
 * sit in the stylesheet to decide; `ui` merges by property, so a later argument
 * wins because it is later. A caller's own class carries no property, so it has
 * nothing to merge against and survives whatever follows it.
 *
 * `variants` merges too, so this package no longer wraps it. It used to:
 * joining let a `size` that sets `width` lose to its own `base`, which took the
 * calendar's day buttons back to `inline-flex` and its month buttons back to a
 * padding they had overridden. That is fixed where it was wrong.
 */

import { layer } from "@barqjs/css";

export const ui = layer("barq.ui");
