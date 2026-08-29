/**
 * THE UNION — every fixture source in this package, in one list.
 *
 * `CODESIGN.md` §12, adopted from Solid: "Their suite compiles the union of ALL
 * fixture sources through EVERY mode. barq has 2 backends x 2 optimisation
 * levels plus the interpreter — five emission modes — and fixtures written per
 * feature. The `backend!` macro proves every backend HANDLES every `Op`; it
 * cannot prove SSR handles `Op::Region` CORRECTLY for a construct only the DOM
 * fixtures exercise."
 *
 * ## What was actually partitioned, and why that is the hole
 *
 * The corpus is five directories and `listFixtures()` returns ONE of them.
 * Every suite that says "the whole corpus" means `fixtures/*.tsx`:
 *
 *   fixtures/            131  differential, interp, ssr, hydration, addresses,
 *                             leaks, oracle, optimality — all of them
 *   fixtures/semantics/   26  L1 only. Compiled for the DOM, at -Ox, and never
 *                             once through the string backend or the reference
 *   fixtures/ownership/    6  L2b only, DOM only
 *   fixtures/l4/           7  the leak and metamorphic sessions, DOM only
 *   fixtures/browser-only/ 1  the Chrome differential, DOM only
 *
 * The partition is defensible for what each suite ASSERTS — `oracle.test.ts`
 * cannot judge a fixture whose point is that it throws, and `SEMANTICS.md`'s
 * own note says so. It is not defensible for whether the code COMPILES. A
 * construct that only `fixtures/semantics/` exercises has never reached the SSR
 * backend, and the `backend!` macro cannot see the difference: it proves every
 * backend has an arm for every `Op`, which is a statement about the match
 * expression and not about the arm.
 *
 * So this file is the union, and `modes.test.ts` drives it through all five
 * emission modes.
 *
 * ## The warning attached to this, from §12, and what it changes
 *
 * "Solid's own SSR/DOM hole-id desync was caught by an end-to-end streaming
 * example, NOT by fixture parity, because parity compares COMPILERS rather than
 * backends against each other."
 *
 * A matrix that only asks "did all five modes emit something" would have missed
 * their bug exactly as their parity suite did. So `modes.test.ts` does not stop
 * at emission: it diffs the two BACKENDS against each other over the union, on
 * the artefact their bug was in — the address table, which `--addresses` exists
 * to make comparable and which `addresses.test.ts` already diffs over
 * `fixtures/` alone. Extending that diff to the union is the point of the union.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { FIXTURE_DIR } from "./harness.ts";

export type Family = "corpus" | "semantics" | "ownership" | "l4" | "browser-only";

export interface Fixture {
  /** `<family>/<name>`, which is how the matrix addresses a row. */
  readonly id: string;
  readonly family: Family;
  readonly name: string;
  /** The filename the compiler is told, which reaches diagnostics and the map. */
  readonly filename: string;
  readonly source: string;
}

const DIRS: Record<Family, string> = {
  corpus: FIXTURE_DIR,
  semantics: join(FIXTURE_DIR, "semantics"),
  ownership: join(FIXTURE_DIR, "ownership"),
  l4: join(FIXTURE_DIR, "l4"),
  "browser-only": join(FIXTURE_DIR, "browser-only"),
};

/**
 * `.module.tsx` files are the SIBLINGS of an ownership fixture — a second file
 * one fixture imports so that it can be shaped like an application rather than
 * like a single file. They are compiled as part of the fixture that imports
 * them and are not fixtures themselves, which is why `listOwnershipFixtures`
 * excludes them; the union excludes them for the same reason and not for a
 * different one.
 */
function namesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".module.tsx"))
    .map((f) => f.slice(0, -4))
    .sort();
}

export function unionFixtures(): Fixture[] {
  const out: Fixture[] = [];
  for (const family of Object.keys(DIRS) as Family[]) {
    for (const name of namesIn(DIRS[family])) {
      out.push({
        id: `${family}/${name}`,
        family,
        name,
        filename: `${name}.tsx`,
        source: readFileSync(join(DIRS[family], `${name}.tsx`), "utf8"),
      });
    }
  }
  return out;
}

/**
 * The five emission modes of `CODESIGN.md` §6 L5, as compiler options.
 *
 * `ssr → hydrate` is L5's fifth mode as a RENDER; as an EMISSION there are five
 * because `hydratable` is a sixth axis on both backends rather than a mode of
 * its own. It is driven separately below, so the matrix covers seven columns
 * and says which two are the hydration ones.
 */
export const MODES = [
  { id: "dom-Ox", options: {} },
  { id: "dom-O0", options: { optimize: 0 } },
  { id: "ssr-Ox", options: { ssr: true } },
  { id: "ssr-O0", options: { ssr: true, optimize: 0 } },
  { id: "interp", options: { interp: true } },
  { id: "dom-hydratable", options: { hydratable: true } },
  { id: "ssr-hydratable", options: { ssr: true, hydratable: true } },
] as const;

export type ModeId = (typeof MODES)[number]["id"];
