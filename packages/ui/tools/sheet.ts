/**
 * The stylesheet this package actually ships, as a declaration set per `ui(…)`
 * call, and the canonical spelling both sides of a comparison are read in.
 *
 * `verify.ts` asks whether every declaration a spec produces is here;
 * `audit.ts` asks the reverse. One reader for both, because the answer only
 * means anything if they read the same thing: a second implementation that
 * scanned differently would disagree with the bar and neither would be wrong.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { type CssNode } from "./css.ts";

/** Every declaration a tree contains, as `property: value`. */
export function declarations(nodes: readonly CssNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.kind === "decl") out.push(node.text.trim());
    else declarations(node.nodes, out);
  }
  return out;
}

/**
 * One canonical spelling for both sides.
 *
 * `oxfmt` reformats the CSS inside a `css` block and Tailwind's output is not
 * formatted at all, so the same rule is written two ways: `color, box-shadow`
 * against `color,box-shadow`, `0.95` against `.95`, and a space between two
 * `var()` calls that the transcriber does not emit. Comparing the text without
 * this reports two thousand differences and no bugs.
 */
export function canonical(text: string): string {
  return text.replace(/\s+/g, "").replace(/([:,(])0\./g, "$1.");
}

/** `borderTopWidth` -> `border-top-width`, and a custom property untouched. */
function kebab(property: string): string {
  if (property.startsWith("--")) return property;
  return property.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** Every `property: "value"` in a piece of source, at any depth. */
function declarationsIn(text: string): Set<string> {
  const held = new Set<string>();

  for (const [, quoted, bare, value] of text.matchAll(
    /(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*"((?:[^"\\]|\\.)*)"/g,
  )) {
    held.add(canonical(`${kebab(quoted ?? bare ?? "")}: ${value ?? ""}`));
  }

  // A fallback is the same property twice, and its own values hold commas
  // and parentheses — `var(--a, var(--b))` — so the call is scanned to its
  // matching close and the quoted strings taken from inside it.
  for (const call of text.matchAll(/(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*firstThatWorks\(/g)) {
    const from = (call.index ?? 0) + call[0].length;
    let unclosed = 1;
    let to = from;
    for (; to < text.length && unclosed > 0; to++) {
      if (text[to] === "(") unclosed++;
      else if (text[to] === ")") unclosed--;
    }
    const property = kebab(call[1] ?? call[2] ?? "");
    for (const [, one] of text.slice(from, to - 1).matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      held.add(canonical(`${property}: ${one ?? ""}`));
    }
  }
  return held;
}

/** The matching close brace for the `{` at `open`. */
function matching(source: string, open: number): number {
  let depth = 0;
  for (let at = open; at < source.length; at++) {
    if (source[at] === "{") depth++;
    else if (source[at] === "}" && --depth === 0) return at;
  }
  return source.length;
}

/**
 * The shared treatments, by the name a component composes them under.
 *
 * A group's declarations belong to every call naming it, which is the whole
 * point of the group: `ring.focus` in a component IS that component declaring
 * the focus ring, and a spec asking for it has to find it there.
 *
 * Keyed `namespace.name`, and the namespace comes from the `export const` each
 * `lib/shared-*.ts` carries, so a file added later needs no edit here.
 */
function sharedGroups(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const lib = join(import.meta.dir, "../src/lib");

  for (const file of readdirSync(lib).toSorted()) {
    if (!/^shared-[\w-]+\.ts$/.test(file)) continue;
    const source = readFileSync(join(lib, file), "utf8");
    // Either spelling of the same call: `createIn("barq.ui", …)` and the bound
    // `layer("barq.ui").create(…)`.
    const declared =
      /export const ([A-Za-z_$][\w$]*) = (?:createIn\("barq\.ui",\s*|[A-Za-z_$][\w$]*\.create\()/.exec(
        source,
      );
    // LOUD, not `continue`. A `shared-*.ts` this cannot read contributes no
    // declarations and every spec asking for them then reports as missing —
    // 512 of them when `createIn` became `ui.create`, with nothing saying why.
    if (declared === null) {
      throw new Error(
        `[verify] ${file} declares no group this tool can read. It looks for ` +
          `\`export const <name> = createIn("barq.ui", {\` or \`= <layer>.create({\`.`,
      );
    }
    const namespace = declared[1] ?? "";
    const open = source.indexOf("{", (declared.index ?? 0) + declared[0].length - 1);
    const close = matching(source, open);

    // One level in: each entry of the group object is a group, and the
    // group name is the key before its brace.
    let at = open + 1;
    while (at < close) {
      const key = /(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*\{/g;
      key.lastIndex = at;
      const found = key.exec(source);
      if (found === null || (found.index ?? 0) >= close) break;
      const body = (found.index ?? 0) + found[0].length - 1;
      const end = matching(source, body);
      out.set(
        `${namespace}.${found[1] ?? found[2] ?? ""}`,
        declarationsIn(source.slice(body, end + 1)),
      );
      at = end + 1;
    }
  }
  return out;
}

/**
 * The components, as a declaration set per `ui(…)` call.
 *
 * Per CALL and not per sheet, because a declaration as ordinary as
 * `overflow: hidden` appears in five components: searching the whole package
 * for it says every spec matches and proves nothing. It used to be per CLASS,
 * read back out of the stylesheet, which said the same thing — until a class
 * became one declaration and the question stopped having an answer there.
 *
 * The call is read rather than evaluated. A literal's keys are properties or
 * conditions, and a condition's value is a block, so a flat scan for
 * `key: "value"` finds every declaration at every depth and no condition; a
 * `shared.x` argument brings that group's declarations with it.
 */
export function byCall(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const groups = sharedGroups();
  const dir = join(import.meta.dir, "../src/ui");

  for (const file of readdirSync(dir).toSorted()) {
    if (!/\.tsx?$/.test(file) || file.includes(".test.")) continue;
    const source = readFileSync(join(dir, file), "utf8");

    for (const start of source.matchAll(/\bui\(/g)) {
      const from = (start.index ?? 0) + start[0].length - 1;
      let unclosed = 0;
      let to = from;
      for (; to < source.length; to++) {
        if (source[to] === "(") unclosed++;
        else if (source[to] === ")" && --unclosed === 0) break;
      }
      const call = source.slice(from, to + 1);
      const held = declarationsIn(call);
      for (const [name, own] of groups) {
        if (!call.includes(`${name},`) && !call.includes(`${name})`)) continue;
        for (const declaration of own) held.add(declaration);
      }
      if (held.size > 0) out.set(`${file}:${String(start.index)}`, held);
    }
  }

  return out;
}
