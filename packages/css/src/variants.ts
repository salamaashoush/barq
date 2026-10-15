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

/** The axes of a spec, whatever each arm holds. */
type Axes = Record<string, Record<string, unknown>>;

/**
 * The values that select an arm of one axis: its names, and a boolean when the
 * axis is an on/off one, spelled `{ true: …, false: … }`.
 */
type Arm<A> = keyof A | (Extract<keyof A, "true" | "false"> extends never ? never : boolean);

/**
 * Which arm of each axis, or nothing to take the default.
 *
 * A value is looked up by its TEXT, so a boolean axis — `{ true: …, false: … }`,
 * which is how an on/off variant is spelled — is selected with a boolean.
 * `null` and `undefined` mean "not chosen" and fall to the default; so does any
 * value the axis has no arm for.
 */
export type VariantSelection<G extends Axes> = {
  readonly [K in keyof G]?: Arm<G[K]> | null | undefined;
};

/**
 * What a compound arm matches on: one arm of an axis, or any of several.
 */
export type VariantMatch<G extends Axes> = {
  readonly [K in keyof G]?: Arm<G[K]> | readonly Arm<G[K]>[] | null | undefined;
};

export interface VariantSpec<G extends VariantGroups> {
  /** Always applied, first, so a variant can override it. */
  readonly base?: string;
  readonly variants: G;
  readonly defaults?: { readonly [K in keyof G]?: Arm<G[K]> };
  /**
   * A class applied only when every named variant matches — the combination a
   * design system needs once the axes stop being independent.
   */
  readonly compound?: readonly {
    readonly when: VariantMatch<G>;
    readonly use: string;
  }[];
}

export type VariantFn<G extends VariantGroups> = (props?: VariantSelection<G>) => string;

/** A class for some of a component's parts. */
export type SlotClasses<S extends string> = { readonly [K in S]?: string };

export type SlotGroups<S extends string> = Record<string, Record<string, SlotClasses<S>>>;

/**
 * {@link VariantSpec} for a component made of several elements: each arm names
 * a class for whichever parts it changes.
 */
export interface SlotSpec<S extends string, G extends SlotGroups<S>> {
  /** Every part, and the class it always carries. */
  readonly slots: { readonly [K in S]: string };
  readonly variants?: G;
  readonly defaults?: { readonly [K in keyof G]?: Arm<G[K]> };
  readonly compound?: readonly {
    readonly when: VariantMatch<G>;
    readonly use: SlotClasses<S>;
  }[];
}

export type SlotFn<S extends string, G extends SlotGroups<S>> = (props?: VariantSelection<G>) => {
  readonly [K in S]: string;
};

/**
 * The selection a {@link variants} function takes, for a component's own props.
 *
 * ```ts
 * type ButtonProps = VariantProps<typeof button> & { class?: string };
 * ```
 */
export type VariantProps<F> = F extends (props?: infer P) => unknown ? NonNullable<P> : never;

interface Axis {
  readonly name: string;
  readonly arms: readonly string[];
  /** Arm name to its place, counted from one: zero is "no arm". */
  readonly places: Map<string, number>;
  readonly fallback: number;
  readonly stride: number;
}

/** What selects an arm once the types are erased: its name, or a boolean for an on/off axis. */
type Chosen = PropertyKey | boolean | null | undefined;

type Selection = Readonly<Record<string, Chosen>>;

interface Compound {
  readonly when: Readonly<Record<string, Chosen | readonly Chosen[]>>;
  readonly use: unknown;
}

/**
 * A spec's selections, numbered.
 *
 * One number per SELECTION, and a spec has finitely many: the product of its
 * axes, which is small by construction because a variant set is enumerated by
 * hand. Numbered rather than spelled, because two selections can spell the
 * same text however the arms are joined and no two share a number.
 */
function selections(
  groups: Axes,
  defaults: Selection | undefined,
): {
  select: (props: Selection | undefined) => number;
  chosen: (selection: number) => Record<string, string | undefined>;
} {
  const axes: Axis[] = [];
  let stride = 1;
  for (const name of Object.keys(groups)) {
    const arms = Object.keys(groups[name] ?? {});
    const places = new Map(arms.map((arm, index) => [arm, index + 1]));
    const preferred = defaults?.[name];
    const fallback = preferred === undefined ? 0 : (places.get(String(preferred)) ?? 0);
    axes.push({ name, arms, places, fallback, stride });
    stride *= arms.length + 1;
  }
  return {
    select(props) {
      let selection = 0;
      for (const axis of axes) {
        const asked = props?.[axis.name];
        // By TEXT, so `{ loud: false }` selects the `false` arm of a boolean
        // axis rather than meaning "not chosen".
        const place =
          asked === null || asked === undefined ? undefined : axis.places.get(String(asked));
        selection += (place ?? axis.fallback) * axis.stride;
      }
      return selection;
    },
    chosen(selection) {
      const out: Record<string, string | undefined> = {};
      for (const axis of axes) {
        const place = Math.floor(selection / axis.stride) % (axis.arms.length + 1);
        out[axis.name] = place === 0 ? undefined : axis.arms[place - 1];
      }
      return out;
    },
  };
}

/**
 * Whether a compound arm applies. A `when` entry that names no value is not a
 * condition, so it matches.
 */
function matches(when: Compound["when"], chosen: Record<string, string | undefined>) {
  for (const group in when) {
    const wanted = when[group];
    if (wanted === null || wanted === undefined) continue;
    const arm = chosen[group];
    const met = Array.isArray(wanted)
      ? wanted.some((one) => String(one) === arm)
      : String(wanted) === arm;
    if (!met) return false;
  }
  return true;
}

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
 *
 * With `slots`, the same thing for a component made of several elements: every
 * arm names a class per part, and the function returns a class per part.
 *
 * ```ts
 * const field = variants({
 *   slots: { root: ui({ display: "grid" }), label: ui({ fontWeight: 500 }) },
 *   variants: { size: { lg: { root: ui({ gap: 8 }), label: ui({ fontSize: 18 }) } } },
 * });
 * const { root, label } = field({ size: "lg" });
 * ```
 */
export function variants<G extends VariantGroups>(spec: VariantSpec<G>): VariantFn<G>;
export function variants<S extends string, G extends SlotGroups<S>>(
  spec: SlotSpec<S, G>,
): SlotFn<S, G>;
export function variants(spec: {
  readonly base?: string;
  readonly slots?: Record<string, string>;
  readonly variants?: Axes;
  readonly defaults?: Selection;
  readonly compound?: readonly Compound[];
}): unknown {
  const groups = spec.variants ?? {};
  const { select, chosen } = selections(groups, spec.defaults);
  const { slots } = spec;

  // Base first, then the axes, then the compounds — and merged, so the later
  // one wins per property rather than both applying. `part` picks one slot's
  // class out of an arm, or takes the arm whole when there are no slots.
  const compose = (selection: number, part: (arm: unknown) => unknown, base?: string): string => {
    const arms = chosen(selection);
    const out: unknown[] = [base];
    for (const group in groups) {
      const arm = arms[group];
      if (arm !== undefined) out.push(part(groups[group]?.[arm]));
    }
    for (const rule of spec.compound ?? []) {
      if (matches(rule.when, arms)) out.push(part(rule.use));
    }
    return atoms(...out.filter((name) => typeof name === "string"));
  };

  // A component re-rendering asks for the same selection over and over, and
  // merging it again each time is the whole cost.
  const composed = new Map<number, unknown>();
  return (props?: Selection) => {
    const selection = select(props);
    let hit = composed.get(selection);
    if (hit === undefined) {
      if (slots === undefined) {
        hit = compose(selection, (arm) => arm, spec.base);
      } else {
        const parts: Record<string, string> = {};
        for (const slot in slots) {
          parts[slot] = compose(
            selection,
            (arm) => (arm as Record<string, unknown> | undefined)?.[slot],
            slots[slot],
          );
        }
        hit = Object.freeze(parts);
      }
      composed.set(selection, hit);
    }
    return hit;
  };
}
