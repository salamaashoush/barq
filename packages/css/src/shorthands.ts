/**
 * The shorthands a merge has to see through.
 *
 * `atoms({ margin: 0 }, { marginTop: 4 })` is one class per declaration, and
 * merging keeps the last class per property. `margin` and `margin-top` are
 * different properties, so both would apply and the CASCADE would decide —
 * which is the source-order footgun atoms exist to remove. Expanded, the second
 * object replaces exactly `margin-top` and the other three survive.
 *
 * Only shorthands whose expansion is POSITIONAL AND TOTAL are here: every
 * longhand is set, and which longhand a value goes to is decided by counting
 * values, not by parsing them. `border`, `background`, `font`, `flex`, `grid`,
 * `transition` and `animation` are none of those — `border: 1px solid red` puts
 * three values in three different sub-properties by TYPE — so they are refused
 * rather than half-expanded. That refusal is the whole of the difference in
 * size against StyleX's 900-line `application-order.js`, and it is a refusal
 * rather than a guess.
 */

/** `[longhands, howManyValuesTheShorthandTakes]`, in CSS's own box order. */
const BOX = ["top", "right", "bottom", "left"] as const;

function box(property: string, suffix = ""): readonly string[] {
  return BOX.map((side) => `${property}-${side}${suffix}`);
}

export const SHORTHANDS: Readonly<Record<string, readonly string[]>> = {
  margin: box("margin"),
  padding: box("padding"),
  inset: ["top", "right", "bottom", "left"],
  "border-width": box("border", "-width"),
  "border-style": box("border", "-style"),
  "border-color": box("border", "-color"),
  "border-radius": [
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-right-radius",
    "border-bottom-left-radius",
  ],
  gap: ["row-gap", "column-gap"],
  overflow: ["overflow-x", "overflow-y"],
  "overscroll-behavior": ["overscroll-behavior-x", "overscroll-behavior-y"],
  "place-items": ["align-items", "justify-items"],
  "place-content": ["align-content", "justify-content"],
  "place-self": ["align-self", "justify-self"],
  "inset-block": ["inset-block-start", "inset-block-end"],
  "inset-inline": ["inset-inline-start", "inset-inline-end"],
  "margin-block": ["margin-block-start", "margin-block-end"],
  "margin-inline": ["margin-inline-start", "margin-inline-end"],
  "padding-block": ["padding-block-start", "padding-block-end"],
  "padding-inline": ["padding-inline-start", "padding-inline-end"],
};

/**
 * Shorthands that cannot be expanded by counting values, and so cannot take
 * part in a merge. Named so the diagnostic can say which one and why.
 */
export const UNEXPANDABLE = new Set([
  "animation",
  "background",
  "border",
  "border-block",
  "border-bottom",
  "border-image",
  "border-inline",
  "border-left",
  "border-right",
  "border-top",
  "flex",
  "flex-flow",
  "font",
  "grid",
  "grid-area",
  "grid-column",
  "grid-row",
  "grid-template",
  "list-style",
  "mask",
  "offset",
  "outline",
  "text-decoration",
  "transition",
]);

/**
 * CSS's own rule for a box shorthand: 1 value is all four, 2 is block/inline,
 * 3 is top/inline/bottom, 4 is each side. A two-longhand shorthand takes 1 or
 * 2. Anything else is left whole for the caller to refuse.
 */
export function expand(property: string, value: string): [string, string][] | null {
  const longhands = SHORTHANDS[property];
  if (longhands === undefined) return null;
  const parts = splitValues(value);
  if (longhands.length === 2) {
    if (parts.length === 1) return longhands.map((name) => [name, parts[0]] as [string, string]);
    if (parts.length === 2) {
      return longhands.map((name, index) => [name, parts[index]] as [string, string]);
    }
    return null;
  }
  const [top, right = top, bottom = top, left = right] = parts;
  if (parts.length < 1 || parts.length > 4) return null;
  return [
    [longhands[0], top],
    [longhands[1], right],
    [longhands[2], bottom],
    [longhands[3], left],
  ];
}

/** Top-level whitespace split, so `calc(1px + 2px)` and `var(--a, b)` stay whole. */
function splitValues(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index <= value.length; index++) {
    const character = value[index];
    if (character === "(") depth++;
    else if (character === ")") depth--;
    else if ((index === value.length || /\s/.test(character ?? "")) && depth === 0) {
      const part = value.slice(start, index).trim();
      if (part !== "") out.push(part);
      start = index + 1;
    }
  }
  return out;
}
