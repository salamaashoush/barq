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

/**
 * Each shorthand's longhands, in the order its values are counted into them.
 *
 * Written out rather than built, like the two tables after it: the compiler
 * generates its own copy from this text at build time, so neither side holds a
 * list the other could drift from.
 */
export const SHORTHANDS: Readonly<Record<string, readonly string[]>> = {
  margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
  padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
  inset: ["top", "right", "bottom", "left"],
  "border-width": [
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
  ],
  "border-style": [
    "border-top-style",
    "border-right-style",
    "border-bottom-style",
    "border-left-style",
  ],
  "border-color": [
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
  ],
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
  "border-block-width": ["border-block-start-width", "border-block-end-width"],
  "border-block-style": ["border-block-start-style", "border-block-end-style"],
  "border-block-color": ["border-block-start-color", "border-block-end-color"],
  "border-inline-width": ["border-inline-start-width", "border-inline-end-width"],
  "border-inline-style": ["border-inline-start-style", "border-inline-end-style"],
  "border-inline-color": ["border-inline-start-color", "border-inline-end-color"],
};

/**
 * One row an axis: its physical longhands, then the logical longhands that
 * land on the same sides.
 *
 * `padding-left` and `padding-inline-start` are two properties and one side of
 * the box, so both apply and the stylesheet's order decides between them, which
 * is whichever was used first anywhere on the page. A merge that keeps the last
 * class per PROPERTY cannot see that, so a longhand also takes the place of
 * every longhand on its axis written the other way: the later key wins, as it
 * does between a shorthand and its own longhand.
 *
 * The whole axis rather than one side, because which side `inline-start` is
 * depends on the element's direction and that is not known here. The rows are
 * the horizontal writing modes', where the block axis is the vertical one.
 */
export const AXES: readonly (readonly [readonly string[], readonly string[]])[] = [
  [
    ["margin-top", "margin-bottom"],
    ["margin-block-start", "margin-block-end"],
  ],
  [
    ["margin-left", "margin-right"],
    ["margin-inline-start", "margin-inline-end"],
  ],
  [
    ["padding-top", "padding-bottom"],
    ["padding-block-start", "padding-block-end"],
  ],
  [
    ["padding-left", "padding-right"],
    ["padding-inline-start", "padding-inline-end"],
  ],
  [
    ["top", "bottom"],
    ["inset-block-start", "inset-block-end"],
  ],
  [
    ["left", "right"],
    ["inset-inline-start", "inset-inline-end"],
  ],
  [
    ["border-top-width", "border-bottom-width"],
    ["border-block-start-width", "border-block-end-width"],
  ],
  [
    ["border-left-width", "border-right-width"],
    ["border-inline-start-width", "border-inline-end-width"],
  ],
  [
    ["border-top-style", "border-bottom-style"],
    ["border-block-start-style", "border-block-end-style"],
  ],
  [
    ["border-left-style", "border-right-style"],
    ["border-inline-start-style", "border-inline-end-style"],
  ],
  [
    ["border-top-color", "border-bottom-color"],
    ["border-block-start-color", "border-block-end-color"],
  ],
  [
    ["border-left-color", "border-right-color"],
    ["border-inline-start-color", "border-inline-end-color"],
  ],
  [
    ["border-top-left-radius", "border-top-right-radius"],
    ["border-start-start-radius", "border-start-end-radius"],
  ],
  [
    ["border-bottom-left-radius", "border-bottom-right-radius"],
    ["border-end-start-radius", "border-end-end-radius"],
  ],
];

/** Each longhand of {@link AXES}, and the longhands it takes the place of. */
export const DISPLACES: ReadonlyMap<string, readonly string[]> = new Map(
  AXES.flatMap(([physical, logical]) => [
    ...physical.map((name) => [name, logical] as const),
    ...logical.map((name) => [name, physical] as const),
  ]),
);

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
 *
 * `!important` is the declaration's and not a side's, so it is taken off
 * before the values are counted and written back onto every longhand.
 */
export function expand(property: string, value: string): [string, string][] | null {
  const longhands = SHORTHANDS[property];
  if (longhands === undefined) return null;
  const bang = /\s*!\s*important\s*$/i.exec(value);
  const important = bang === null ? "" : " !important";
  const body = bang === null ? value : value.slice(0, bang.index);
  const values = property === "border-radius" ? radii(body) : sides(longhands.length, body);
  if (values === null) return null;
  return longhands.map((name, index) => [name, `${values[index]}${important}`]);
}

function sides(count: number, value: string): string[] | null {
  const parts = splitValues(value);
  if (count === 2) {
    if (parts.length === 1) return [parts[0], parts[0]];
    return parts.length === 2 ? parts : null;
  }
  if (parts.length < 1 || parts.length > 4) return null;
  const [top, right = top, bottom = top, left = right] = parts as [
    string,
    string?,
    string?,
    string?,
  ];
  return [top, right, bottom, left];
}

/**
 * `border-radius` is two box shorthands either side of a slash, the
 * horizontal radii and the vertical, and each corner takes one of each.
 */
function radii(value: string): string[] | null {
  const slash = topLevel(value, "/");
  if (slash < 0) return sides(4, value);
  const horizontal = sides(4, value.slice(0, slash));
  const vertical = sides(4, value.slice(slash + 1));
  if (horizontal === null || vertical === null) return null;
  return horizontal.map((radius, corner) => `${radius} ${vertical[corner]}`);
}

function topLevel(value: string, wanted: string): number {
  let depth = 0;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character === "(") depth++;
    else if (character === ")") depth--;
    else if (character === wanted && depth === 0) return index;
  }
  return -1;
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
    else if (depth === 0 && (character === undefined || WHITESPACE.includes(character))) {
      if (index > start) out.push(value.slice(start, index));
      start = index + 1;
    }
  }
  return out;
}

const WHITESPACE = " \t\n\r\f";
