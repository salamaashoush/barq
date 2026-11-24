import type { Child, JSXElement } from "@barqjs/core";
import { type RenderPart, partRender } from "@barqjs/ui/slot";

import { arcLayer as arc } from "../layer.ts";

/**
 * arc's one customisation contract, which every component takes:
 *
 * - `class` (and `className`) on the root, after the component's own classes;
 * - `classes`, a class per part, typed by the component's slots and merged
 *   after the part's own, so a caller's atom replaces the component's for
 *   that property and a caller's plain class rides along;
 * - a `data-slot` on every part, which is what `[data-slot="…"]` selects;
 * - the component's styles exported as a `variants({ slots })` function,
 *   which an app calls for the classes of a look it draws itself;
 * - where a part is an element arc draws for content the caller gave it,
 *   `renders`, another element in its place.
 */
export type Classes<Slots> = { readonly [K in keyof Slots]?: string };

export interface Customisable<Slots> {
  /** On the root, merged after the component's own classes. */
  class?: string;
  className?: string;
  /** A class per part, merged after the part's own. */
  classes?: Classes<Slots>;
}

/** The parts' classes with the caller's for each merged after. */
export function parts<Slots extends Readonly<Record<string, string>>>(
  own: Slots,
  given: Classes<Slots> | undefined,
): Slots {
  if (given === undefined) return own;
  const out: Record<string, string> = {};
  for (const name in own) out[name] = arc(own[name], given[name]);
  return out as unknown as Slots;
}

/**
 * A part drawn by the caller: the attributes it would have carried (its class,
 * its slot, an id something points at) and the content it would have held,
 * handed to `render`.
 */
export function rendered(
  render: RenderPart<Child>,
  attributes: Readonly<Record<string, string>>,
  content: Child,
): JSXElement {
  return render(partRender({ ...attributes }), content) as JSXElement;
}
