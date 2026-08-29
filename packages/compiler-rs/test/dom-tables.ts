/**
 * The runtime tables, read out of `packages/core/src/dom.ts` AS IT IS ON DISK.
 *
 * DESIGN §9 calls table generation "the only mechanism that keeps the compiler
 * and the runtime honest". `build.rs` re-derives them on every build
 * `cargo:rerun-if-changed` triggers, and `src/tables.rs`'s own test proves the
 * GENERATOR is sensitive to an edit. Neither can see the drift that actually
 * reaches a user: the compiler ships as a prebuilt `.node`, and a `dom.ts` that
 * moved after that binary was produced is a compiler emitting rules the runtime
 * no longer has.
 *
 * This is that check's raw material, and it lives in its own module because two
 * suites need it — `tables.test.ts` for the DOM target and `ssr.test.ts` for the
 * px rule, which only becomes observable once the SSR backend folds a style
 * object. A second copy of this parser is how the two would end up measuring
 * different tables.
 *
 * `BARQ_DOM_TS` points it at a different `dom.ts`, which is how the check is
 * itself checked: aim it at an edited copy and the rows that read it fail.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const DOM_TS =
  process.env.BARQ_DOM_TS ?? join(import.meta.dir, "..", "..", "core", "src", "dom.ts");
const source = readFileSync(DOM_TS, "utf8");

const unquote = (text: string): string =>
  text
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();

/** `const NAME: Record<string, 1> = { a: 1, "b-c": 1 };` */
function record(name: string): string[] {
  return entries(`const ${name}: Record<string, 1> = {`, "{", "}", name).map((entry) =>
    unquote(entry.slice(0, entry.lastIndexOf(":"))),
  );
}

/** `const NAME = new Set(["a", "b"]);` */
function set(name: string): string[] {
  return entries(`const ${name} = new Set([`, "[", "]", name).map(unquote);
}

function entries(header: string, open: string, close: string, name: string): string[] {
  const at = source.indexOf(header);
  if (at === -1) throw new Error(`dom.ts no longer declares \`${header}\` — this check is stale`);
  let depth = 1;
  let end = at + header.length;
  while (end < source.length && depth > 0) {
    if (source[end] === open) depth++;
    else if (source[end] === close) depth--;
    if (depth > 0) end++;
  }
  const out = source
    .slice(at + header.length, end)
    .split("\n")
    .map((line) => (line.includes("//") ? line.slice(0, line.indexOf("//")) : line))
    .join("\n")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (out.length === 0)
    throw new Error(`\`${name}\` in dom.ts came out empty — this check is stale`);
  return out;
}

const DELEGATED_EVENTS = set("DELEGATED_EVENTS");
const NON_BUBBLING_EVENTS = set("NON_BUBBLING_EVENTS");
const SVG_TAGS = record("SVG_TAGS");
const DOM_PROPS = record("DOM_PROPS");
const USER_MUTABLE_PROPS = record("USER_MUTABLE_PROPS");
const CSS_NUMBER_PROPS = record("CSS_NUMBER_PROPS");

export {
  DELEGATED_EVENTS,
  NON_BUBBLING_EVENTS,
  SVG_TAGS,
  DOM_PROPS,
  USER_MUTABLE_PROPS,
  CSS_NUMBER_PROPS,
};
