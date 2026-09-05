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

import { byCall, canonical, declarations } from "./sheet.ts";
import { createBuilder, parse, translate } from "./css.ts";

/** Where this package deliberately differs, and why. */
const ALLOWED: Record<string, string> = {
  "wave6:slider-track:overflow":
    "the thumb is a CHILD of the track here, so `overflow: hidden` clipped it",
  "sidebar:sidebar-container:height":
    "`inset-block: 0` already says as tall as my containing block, and for a " +
    "fixed element with no contained ancestor that IS the viewport — so the " +
    "two agree wherever `h-svh` was right. Inside anything establishing a " +
    "containing block for fixed descendants, a viewport unit is the one thing " +
    "containment cannot redirect, and the sidebar came out a window tall in a " +
    "shorter panel with its footer below the fold",
  "chart:chart-grid-line:stroke":
    "the scene is drawn by TanStack Charts and a node's paint arrives as a " +
    "presentation attribute rather than a class, so the token reaches the " +
    'element as `stroke="var(--border)"`. The value is upstream\'s; the ' +
    "carrier is not, and a class on an element the renderer owns would be " +
    "overwritten on the next scene",
  "chart:chart-axis-label:fill": 'as above, as `fill="var(--muted-foreground)"`',
  "popover:popover-content:transform-origin":
    "`origin-(--radix-popover-content-transform-origin)` reads a variable " +
    "Radix's popper writes from its own measurement, and there is no popper " +
    "here to write it. An undefined `var()` is invalid at computed-value time " +
    "and the origin would fall back to `50% 50%`, which scales the panel out " +
    "of its own corner. The origin is a rule per `data-placement` instead, " +
    "which is the same four values Radix computes",
  "hover-card:hover-card-content:transform-origin": "as above, per placement",
  "tooltip:tooltip-content:transform-origin": "as above, per placement",
  "message-scroller:message-scroller-button:transition-duration":
    "`transition-[…]` and `duration-200` set the SAME property, and an atom " +
    "is one declaration: the literal wins and the `var()` form it replaces " +
    "cannot also be present",
};

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

  const sheet = byCall();

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
