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

import { collectCss } from "@barqjs/css";

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
  return text
    .replace(/\s+/g, " ")
    .replaceAll(", ", ",")
    .replaceAll(") ", ")")
    .replace(/(^|[\s:,(])0\./g, "$1.")
    .trim();
}

/**
 * The stylesheet, as a declaration set per class.
 *
 * Per CLASS and not per sheet, because a declaration as ordinary as
 * `overflow: hidden` appears in five components: searching the whole sheet for
 * it says every spec matches and proves nothing.
 */
function byClass(css: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const walk = (nodes: readonly CssNode[], selector: string): void => {
    for (const node of nodes) {
      if (node.kind === "decl") {
        for (const name of selector.matchAll(/\.([A-Za-z][\w-]*)/g)) {
          const key = name[1] ?? "";
          const held = out.get(key) ?? new Set<string>();
          held.add(canonical(node.text));
          out.set(key, held);
        }
      } else if (node.kind === "rule") {
        walk(node.nodes, `${selector} ${node.selector}`);
      } else {
        walk(node.nodes, selector);
      }
    }
  };
  walk(parse(css), "");
  return out;
}

/** The class whose rules cover most of what the spec asks for. */
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

  // Importing the barrel registers every component's `css` block.
  await import("../src/index.ts");
  const sheet = byClass(collectCss());

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
