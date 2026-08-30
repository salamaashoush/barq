/**
 * A class per combination of variant, from blocks that each compile on their
 * own.
 *
 * Deliberately not a compiler feature: every arm is an ordinary `css` block, so
 * the compiler already turns each into a class and this is a pure string
 * function over the results. There is no CSS here to emit and nothing to
 * register.
 */

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
    return out.join(" ");
  };
}
