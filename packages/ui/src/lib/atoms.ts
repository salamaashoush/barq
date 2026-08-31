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
 * merges the runtime does anyway, in `slot.ts` and in `uiVariants`.
 *
 * Merging is the other half. Concatenating leaves the order the rules happen to
 * sit in the stylesheet to decide; `ui` merges by property, so a later argument
 * wins because it is later. A caller's own class carries no property, so it has
 * nothing to merge against and survives whatever follows it.
 */

import { layer, variants, type VariantFn, type VariantGroups, type VariantSpec } from "@barqjs/css";

export const ui = layer("barq.ui");

/**
 * `variants`, merged.
 *
 * `variants` JOINS its base, its variants and its compounds, which is right
 * for whole-block classes: the stylesheet decides between them, and the spec
 * is written knowing that. Atoms are merged instead — the last argument wins
 * per property — so a size that sets `width` over a base that sets `width`
 * has to go through `ui` or the two classes both apply and the sheet's order
 * decides. That is what took the calendar's day buttons back to `inline-flex`
 * and its month buttons back to a padding they had overridden.
 */
export function uiVariants<G extends VariantGroups>(spec: VariantSpec<G>): VariantFn<G> {
  const compose = variants(spec);
  return (props) => ui(compose(props));
}
