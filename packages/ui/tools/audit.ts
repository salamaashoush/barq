/**
 * What a component ships that upstream's class lists do NOT ask for.
 *
 * `verify.ts` asks one question — is every declaration in a spec present here —
 * and the re-port needs the other one too. A rule shadcn dropped between the
 * registry this was ported from and the current one stays in the component
 * forever otherwise: nothing looks for it, and `verify` reads 0 missing while
 * the component wears a border upstream removed.
 *
 * ```
 * bun run tools/audit.ts card        # both directions, slot by slot
 * ```
 *
 * The extra side is a PROMPT, not a bar. A shared atom brings declarations the
 * spec never named, `@barqjs/aria` needs rules Radix gets from its own markup,
 * and `PORTING.md` records where this package diverges on purpose. Read each
 * one and decide; the ones that matter are the ones upstream used to have.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { byCall, canonical, declarations } from "./sheet.ts";
import { createBuilder, parse, translate } from "./css.ts";

async function main(): Promise<void> {
  const only = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
  if (only.length === 0) throw new Error("usage: bun run tools/audit.ts <component>…");

  const specs = join(import.meta.dir, "../specs");
  const build = await createBuilder();
  const sheet = byCall();

  for (const name of only) {
    const spec = JSON.parse(readFileSync(join(specs, `${name}.json`), "utf8")) as Record<
      string,
      string
    >;
    process.stdout.write(`\n===== ${name} =====\n`);

    // The component's OWN file, not the package. `verify` matches a slot
    // against every call there is, which answers "is this rule anywhere"; the
    // extra side needs "what does this component ship", and a slot whose
    // literal is small enough matches some other component's better than its
    // own — `card-action` picked the accordion's trigger.
    const file = `${name}.tsx`;
    const mine = new Map([...sheet].filter(([key]) => key.startsWith(`${file}:`)));
    const within = mine.size > 0 ? mine : sheet;

    // One call may serve several slots of a spec (a `cva`'s base and its
    // variants are separate entries and one literal), so a declaration is only
    // extra if NO slot of this component asked for it.
    const asked = new Set<string>();
    const calls = new Map<string, Set<string>>();

    for (const [slot, classes] of Object.entries(spec)) {
      const result = await translate(build, classes);
      const wanted = declarations(parse(result.css)).map(canonical);
      for (const one of wanted) asked.add(one);

      const pick = (from: Map<string, Set<string>>): [string, Set<string>] => {
        let held = new Set<string>();
        let key = "";
        let score = 0;
        for (const [name_, own] of from) {
          let overlap = 0;
          for (const decl of wanted) if (own.has(decl)) overlap++;
          if (overlap > score) {
            score = overlap;
            held = own;
            key = name_;
          }
        }
        return [key, held];
      };

      // A component that COMPOSES another owns slots whose class lives in the
      // other's file — the menubar's items are the dropdown menu's. Nothing in
      // this file matching at all is the signal for that, and the package-wide
      // best is then the right answer.
      let [bestKey, best] = pick(within);
      if (bestKey === "") [bestKey, best] = pick(sheet);
      if (bestKey !== "") calls.set(bestKey, best);

      const absent = wanted.filter((decl) => !best.has(decl));
      if (absent.length === 0) continue;
      process.stdout.write(`\n${slot}  (${bestKey === "" ? "NO MATCHING CALL" : bestKey})\n`);
      for (const decl of absent) process.stdout.write(`  missing: ${decl}\n`);
    }

    for (const [key, held] of calls) {
      const extra = [...held].filter((decl) => !asked.has(decl));
      if (extra.length === 0) continue;
      process.stdout.write(`\nextra in ${key}\n`);
      for (const decl of extra.toSorted()) process.stdout.write(`  ${decl}\n`);
    }
  }
}

await main();
