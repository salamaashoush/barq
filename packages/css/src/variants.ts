/**
 * A class per combination of variant, from blocks or groups that each compile
 * on their own.
 *
 * Deliberately not a compiler feature: every arm is an ordinary `css` block or
 * `atoms` call, so the compiler already turned each into a class and this is a
 * pure string function over the results. There is no CSS here to emit and
 * nothing to register.
 *
 * It MERGES, which is what `atoms` does and what the rest of this package
 * means by composing. Joining was the other option and it was wrong: two atoms
 * for one property both apply and the stylesheet's order decides, so a `size`
 * that sets `width` over a `base` that sets `width` lost to its own base. That
 * cost `@barqjs/ui` a calendar whose day buttons fell back to `inline-flex`
 * and whose month buttons regained a padding they had overridden.
 *
 * Merging costs a whole-block arm nothing. A `css` block's class carries no
 * property, so it merges against itself and survives whatever follows it —
 * joining and merging give the same list, minus a repeat.
 */

import { atoms } from "./atoms.ts";

export type VariantGroups = Record<string, Record<string, string>>;

export type VariantSelection<G extends VariantGroups> = {
  readonly [K in keyof G]?: keyof G[K] | false | null | undefined;
};

export interface VariantSpec<G extends VariantGroups> {
  /** Always applied, first, so a variant can override it. */
  readonly base?: string;
  readonly variants: G;
  readonly defaults?: { readonly [K in keyof G]?: keyof G[K] };
  /**
   * A class applied only when every named variant matches — the combination a
   * design system needs once the axes stop being independent.
   */
  readonly compound?: readonly {
    readonly when: VariantSelection<G>;
    readonly use: string;
  }[];
}

export type VariantFn<G extends VariantGroups> = (props?: VariantSelection<G>) => string;

/**
 * A function from a selection of variants to the class it composes.
 *
 * The base first so an axis can override it, then the axes in declaration
 * order, then the compound arms so a combination wins over what it refines.
 * Every arm is a class something else already compiled — a `css` block or an
 * `atoms` call — so this emits no CSS and registers nothing.
 *
 * ```ts
 * const button = variants({
 *   base: ui({ border: 0, cursor: "pointer" }),
 *   variants: { size: { sm: ui({ padding: 4 }), lg: ui({ padding: 12 }) } },
 *   defaults: { size: "sm" },
 *   compound: [{ when: { size: "lg" }, use: ui({ fontWeight: 600 }) }],
 * });
 * button({ size: "lg" });
 * ```
 *
 * A selection typed against the groups, so `button({ size: "md" })` does not
 * compile.
 */
export function variants<G extends VariantGroups>(spec: VariantSpec<G>): VariantFn<G> {
  const groups = Object.keys(spec.variants) as (keyof G)[];

  return (props) => {
    const chosen = {} as Record<keyof G, string | undefined>;
    for (const group of groups) {
      const asked = props?.[group];
      const value =
        asked === false || asked === null || asked === undefined ? spec.defaults?.[group] : asked;
      chosen[group] = value === undefined ? undefined : String(value);
    }

    const out: string[] = [];
    if (spec.base !== undefined && spec.base !== "") out.push(spec.base);
    for (const group of groups) {
      const value = chosen[group];
      if (value === undefined) continue;
      const className = spec.variants[group]?.[value];
      if (className !== undefined && className !== "") out.push(className);
    }
    // Last, so a combination wins over the single-axis classes it refines.
    for (const rule of spec.compound ?? []) {
      const matches = Object.entries(rule.when).every(
        ([group, value]) => chosen[group as keyof G] === String(value),
      );
      if (matches && rule.use !== "") out.push(rule.use);
    }
    // Base first, then the axes, then the compounds — and merged, so the later
    // one wins per property rather than both applying.
    return atoms(...out);
  };
}
