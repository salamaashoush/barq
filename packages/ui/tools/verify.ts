/**
 * Every rule shadcn's class lists produce, checked against what this package
 * ships.
 *
 * `transcribe.ts` turns a class list into CSS; this runs the same translation
 * over every entry in `specs/` and asserts each declaration it produces is
 * somewhere in the stylesheet the components register. A rule that was never
 * pasted, one lost to an edit, and one whose value drifted all look the same
 * from the outside — the component is simply missing part of the look — and
 * none of them fails a test that asserts on the rules it knows about.
 *
 * ```
 * bun run tools/verify.ts            # every spec
 * bun run tools/verify.ts button     # one
 * ```
 *
 * Deliberate divergences are listed in `ALLOWED`, each with the reason. That
 * list is the whole record of where this package does not match upstream.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createBuilder, parse, translate, type CssNode } from "./css.ts";

/** Where this package deliberately differs, and why. */
const ALLOWED: Record<string, string> = {
  "wave6:slider-track:overflow":
    "the thumb is a CHILD of the track here, so `overflow: hidden` clipped it",
};

/** Every declaration a tree contains, as `property: value`. */
function declarations(nodes: readonly CssNode[], out: string[] = []): string[] {
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
function canonical(text: string): string {
  return text.replace(/\s+/g, "").replace(/([:,(])0\./g, "$1.");
}

/** `borderTopWidth` -> `border-top-width`, and a custom property untouched. */
function kebab(property: string): string {
  if (property.startsWith("--")) return property;
  return property.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * The components, as a declaration set per `ui({ … })` literal.
 *
 * Per LITERAL and not per sheet, because a declaration as ordinary as
 * `overflow: hidden` appears in five components: searching the whole package
 * for it says every spec matches and proves nothing. It used to be per CLASS,
 * read back out of the stylesheet, which said the same thing — until a class
 * became one declaration and the question stopped having an answer there.
 *
 * The literal is read rather than evaluated. Its keys are properties or
 * conditions, and a condition's value is a block, so a flat scan for
 * `key: "value"` finds every declaration at every depth and no condition.
 */
function byLiteral(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const dir = join(import.meta.dir, "../src/ui");

  for (const file of readdirSync(dir).toSorted()) {
    if (!/\.tsx?$/.test(file) || file.includes(".test.")) continue;
    const source = readFileSync(join(dir, file), "utf8");

    for (const start of source.matchAll(/\bui\(\{/g)) {
      const open = (start.index ?? 0) + 3;
      let depth = 0;
      let at = open;
      for (; at < source.length; at++) {
        if (source[at] === "{") depth++;
        else if (source[at] === "}" && --depth === 0) break;
      }
      const literal = source.slice(open, at + 1);
      const held = new Set<string>();

      for (const [, quoted, bare, value] of literal.matchAll(
        /(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*"((?:[^"\\]|\\.)*)"/g,
      )) {
        held.add(canonical(`${kebab(quoted ?? bare ?? "")}: ${value ?? ""}`));
      }

      // A fallback is the same property twice, and its own values hold commas
      // and parentheses — `var(--a, var(--b))` — so the call is scanned to its
      // matching close and the quoted strings taken from inside it.
      for (const call of literal.matchAll(
        /(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*firstThatWorks\(/g,
      )) {
        const from = (call.index ?? 0) + call[0].length;
        let unclosed = 1;
        let to = from;
        for (; to < literal.length && unclosed > 0; to++) {
          if (literal[to] === "(") unclosed++;
          else if (literal[to] === ")") unclosed--;
        }
        const property = kebab(call[1] ?? call[2] ?? "");
        for (const [, one] of literal.slice(from, to - 1).matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
          held.add(canonical(`${property}: ${one ?? ""}`));
        }
      }
      if (held.size > 0) out.set(`${file}:${String(start.index)}`, held);
    }
  }

  return out;
}

/** The literal whose declarations cover most of what the spec asks for. */
function bestMatch(sheet: Map<string, Set<string>>, wanted: readonly string[]): Set<string> {
  let best = new Set<string>();
  let score = -1;
  for (const held of sheet.values()) {
    let overlap = 0;
    for (const decl of wanted) if (held.has(decl)) overlap++;
    if (overlap > score) {
      score = overlap;
      best = held;
    }
  }
  return best;
}

async function main(): Promise<void> {
  const only = process.argv[2];
  const specs = join(import.meta.dir, "../specs");
  const build = await createBuilder();

  const sheet = byLiteral();

  let checked = 0;
  let missing = 0;

  for (const file of readdirSync(specs).toSorted()) {
    if (!file.endsWith(".json")) continue;
    const name = file.replace(/\.json$/, "");
    if (only !== undefined && only !== name) continue;

    const spec = JSON.parse(readFileSync(join(specs, file), "utf8")) as Record<string, string>;
    for (const [slot, classes] of Object.entries(spec)) {
      const result = await translate(build, classes);
      const wanted = declarations(parse(result.css)).map(canonical);
      const held = bestMatch(sheet, wanted);
      const absent = wanted.filter((decl) => !held.has(decl));
      checked += wanted.length;
      if (absent.length === 0) continue;

      const real = absent.filter((decl) => {
        const property = decl.slice(0, decl.indexOf(":")).trim();
        return ALLOWED[`${name}:${slot}:${property}`] === undefined;
      });
      if (real.length === 0) continue;

      missing += real.length;
      process.stdout.write(`\n${name} / ${slot}\n`);
      for (const decl of real) process.stdout.write(`  missing: ${decl}\n`);
    }
  }

  process.stdout.write(
    `\n${String(checked)} declarations from shadcn's class lists, ${String(missing)} not in the stylesheet\n`,
  );
  if (missing > 0) process.exitCode = 1;
}

await main();
