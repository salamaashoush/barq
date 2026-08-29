/**
 * EMI-style mutation — `CODESIGN.md` §6 L3, driver 3.
 *
 * Equivalence Modulo Inputs. Le, Afshari and Su's insight is that a program and
 * a driver together decide which code is LIVE; everything else can be replaced
 * by anything at all and a correct compiler must emit a program that behaves
 * identically. It needs no reference implementation, and DUMPLING found eight
 * new bugs in a JavaScript engine that had already been fuzzed for a decade
 * doing exactly this.
 *
 * Here the unit is a JSX subtree a fixture's driver never renders — an untaken
 * ternary branch, an unselected `Match`, a `Show` fallback that is never shown,
 * a component that is never called. Mutating one must change nothing: not the
 * DOM of any frame, not the node identities, not the effect counts. What it DOES
 * change is the compiler's input — the template bytes P7 hashes, the sibling
 * indices P6 walks, the node the anchor pass elides against — which is precisely
 * where a template compiler's wrong-but-plausible bugs live.
 *
 * ## Deciding what is unreached, soundly
 *
 * The classification is EMPIRICAL, not syntactic, because a syntactic guess at
 * liveness is exactly the kind of assumption a compiler bug hides behind. Each
 * candidate element is first given a PROBE — an attribute that would be visible
 * in the DOM if that element were ever rendered — and the fixture is driven
 * through every step and every event. A probe that shows up ANYWHERE the render
 * constructed means the subtree is live and the candidate is discarded. Only
 * what never appeared is mutated.
 *
 * "Anywhere the render constructed" is `RenderResult.seen`, and the precision of
 * that word is the whole soundness argument. Reading the container's frames was
 * the first attempt and it is WRONG in the dangerous direction, on two shapes
 * this corpus contains: a `<Portal>` renders into `document.body` rather than
 * into the container, and a `<Show>` toggled on and off inside one step is
 * constructed and destroyed between two snapshots. Both would have been called
 * unreached and then mutated, and a divergence the mutation caused would have
 * been reported as the compiler's. So `seen` is the whole document at every
 * frame PLUS the markup of every template clone the tracer recorded, attached or
 * not — over-approximating liveness, which costs mutations and can never
 * manufacture a failure.
 *
 * That is also why candidates are restricted to lowercase INTRINSIC elements: a
 * probe attribute on a component is a prop, and a component that drops the prop
 * would look unreached while being rendered — the same unsound direction.
 */

import { stripLiterals } from "./harness.ts";

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

/**
 * Elements whose CHILD positions the HTML parser rewrites. A stray `<i>` or a
 * text run inside `<tr>` is foster-parented out of the table, and inside
 * `<select>` it is dropped — so the mutation would not land where it was
 * written, and a divergence would be the parser's rather than the compiler's.
 * These take the attribute operator only, which no insertion mode moves.
 */
const REPARENTING_TAGS = new Set([
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "colgroup",
  "select",
  "optgroup",
]);

export interface Candidate {
  /** Offset of the `<`. */
  at: number;
  tag: string;
  /** Offset just past the tag name, where an attribute may be inserted. */
  afterTag: number;
  /** Offset just past the `>` of the opening tag. */
  afterOpen: number;
  selfClosing: boolean;
  /** Whether an element may be inserted immediately before this one. */
  siblingPosition: boolean;
}

/**
 * Every intrinsic JSX element in the source, found on the LITERAL-BLANKED text
 * so a `"<div>"` inside a string or a doc comment can never be mistaken for
 * markup. Offsets index the original source, which `stripLiterals` keeps
 * aligned by blanking in place rather than deleting.
 */
export function candidates(source: string): Candidate[] {
  const code = stripLiterals(source);
  const out: Candidate[] = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] !== "<") continue;
    const name = /^<([a-z][a-z0-9]*)/.exec(code.slice(i, i + 24));
    if (!name) continue;
    const afterTag = i + name[0].length;
    // A tag name must be followed by whitespace, `>` or `/`; `<a+b` is a
    // comparison, not markup.
    if (!/[\s/>]/.test(code[afterTag] ?? "")) continue;
    if (!opensAnElement(code, i)) continue;
    const open = openingTagEnd(code, afterTag);
    if (open === undefined) continue;
    out.push({
      at: i,
      tag: name[1],
      afterTag,
      afterOpen: open.end,
      selfClosing: open.selfClosing || VOID_ELEMENTS.has(name[1]),
      siblingPosition: precededByChildPosition(code, i),
    });
  }
  return out;
}

/**
 * The keywords a JSX element may directly follow. Everything else that ends in
 * an identifier character opens a TYPE ARGUMENT list, not an element:
 * `signal<boolean>(false)` and `new Promise<string>(…)` both look exactly like
 * an intrinsic tag to a scanner that only reads forwards, and inserting an
 * attribute into one produces a parse error rather than a mutant — which is how
 * this was found, on three fixtures at once.
 */
const JSX_MAY_FOLLOW = new Set([
  "return",
  "yield",
  "case",
  "else",
  "do",
  "in",
  "of",
  "typeof",
  "void",
  "await",
  "delete",
  "new",
  "default",
]);

function opensAnElement(code: string, at: number): boolean {
  let i = at - 1;
  while (i >= 0 && /\s/.test(code[i])) i--;
  if (i < 0) return true;
  if (!/[\w$)\]]/.test(code[i])) return true;
  if (code[i] === ")" || code[i] === "]") return false;
  let start = i;
  while (start >= 0 && /[\w$]/.test(code[start])) start--;
  return JSX_MAY_FOLLOW.has(code.slice(start + 1, i + 1));
}

/**
 * The `>` that ends an opening tag, skipping the `>` inside a JSX attribute
 * expression — `onClick={() => f()}` carries one and it is not the tag's.
 */
function openingTagEnd(
  code: string,
  from: number,
): { end: number; selfClosing: boolean } | undefined {
  let depth = 0;
  for (let i = from; i < code.length; i++) {
    const ch = code[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (depth === 0 && ch === ">") {
      return { end: i + 1, selfClosing: code[i - 1] === "/" };
    } else if (depth === 0 && ch === "<") return undefined;
  }
  return undefined;
}

/**
 * Whether an element may legally be inserted immediately before this one, which
 * is true exactly in a CHILD position. In a root position — after `return`,
 * `=>`, `(`, `,` or `=` — a second element beside it is a syntax error, or
 * silently changes one root into two.
 */
function precededByChildPosition(code: string, at: number): boolean {
  let i = at - 1;
  while (i >= 0 && /\s/.test(code[i])) i--;
  if (i < 0) return false;
  // `=>` also ends in `>`, and the element after one is the arrow's whole body —
  // a second element beside it is "adjacent JSX elements must be wrapped".
  if (code[i] === ">") return code[i - 1] !== "=";
  return code[i] === "}";
}

export const PROBE_ATTRIBUTE = "data-emi-probe";

/** The candidate marked so that rendering it anywhere becomes visible. */
export function probed(source: string, candidate: Candidate, id: number): string {
  return insert(source, candidate.afterTag, ` ${PROBE_ATTRIBUTE}="${id}"`);
}

export type Operator = "attribute" | "sibling" | "text";

export interface Mutation {
  operator: Operator;
  source: string;
}

/**
 * The arbitrary rewrites. Each is chosen to move something the OPTIMISER reads:
 *
 *  - `attribute` changes the element's serialised bytes, so P7's template hash
 *    and every dedup decision that depended on it move.
 *  - `sibling` changes the sibling INDICES of everything after it, so P6's walk
 *    plan and P5's anchor choice for the enclosing group are recomputed against
 *    a different skeleton.
 *  - `text` puts a literal run next to whatever followed the opening tag, which
 *    is the one thing anchor elision reasons about (two text runs fuse across an
 *    elided hole).
 *
 * All three are STATIC markup. A mutation carrying a live binding would create
 * an effect, and then a change in the effect count would be the mutation's doing
 * rather than the compiler's.
 */
export function mutations(source: string, candidate: Candidate): Mutation[] {
  const out: Mutation[] = [
    {
      operator: "attribute",
      source: insert(source, candidate.afterTag, ` data-emi="a&amp;b" lang="emi"`),
    },
  ];
  if (candidate.siblingPosition) {
    out.push({
      operator: "sibling",
      source: insert(source, candidate.at, `<i class="emi-sibling">emi</i>`),
    });
  }
  if (!candidate.selfClosing) {
    out.push({ operator: "text", source: insert(source, candidate.afterOpen, "emi-text") });
  }
  return out;
}

function insert(source: string, at: number, text: string): string {
  return source.slice(0, at) + text + source.slice(at);
}
