/**
 * What a rule COMPUTES to, beside what upstream's computes to.
 *
 * `verify.ts` proves every declaration shadcn's classes produce is somewhere in
 * this package's stylesheet. That is a weaker claim than "it looks the same": a
 * declaration can be present and lose to another rule, or land on the wrong
 * element entirely and still be found. Only a browser settles it.
 *
 * This writes the two things a browser needs and nothing else:
 *
 * - `theirs.css.txt` — real Tailwind's output for every candidate in `specs/`,
 *   UTILITIES only. The `base` layer is a reset that zeroes padding, margin and
 *   border on every element, and its layer sorts after this package's, so
 *   injecting the whole sheet made all 84 comparable slots differ.
 * - `spec.json` — the class list per slot, so the probe can be built.
 *
 * `compare.js` is the browser half: run it in the gallery's console, or through
 * a driver, and it appends a probe carrying upstream's classes beside each
 * element this package rendered and reports every computed property that
 * differs. It compares only slots with exactly ONE visible element, because
 * which element a rule meant is otherwise a guess.
 *
 * ```
 * bun run gallery:build && bun run tools/geometry.ts
 * bun run gallery                       # then run compare.js in the page
 * ```
 *
 * It found `cn-radio-group` landing on the wrapper rather than the row inside
 * it, `display: grid | block`, which every other check called a success.
 *
 * WHAT IT DOES NOT PROVE. The probe is built from `specs/*.json`, which are this
 * package's transcription INPUTS rather than upstream's source. Several were
 * written against an older shadcn and are a subset of what its component
 * carries today — `tabs-list` without `bg-muted`, `native-select` with `px-3`
 * where upstream now has `pr-8`. Those report as differences and the component
 * here is the newer one. `verify.ts` cannot see it either, since it asks only
 * that every spec declaration EXISTS here and never the reverse. Reading the
 * class lists out of the pinned components instead is the next step.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { createBuilder, print } from "./css.ts";
import { selectorFor, slotsWeEmit } from "./styles.ts";

const SPECS = resolve(import.meta.dir, "../specs");
const OUT = resolve(import.meta.dir, "../gallery/geometry");

/** Every `slot -> class list` the specs describe, keyed `spec/slot`. */
function everySlot(): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of readdirSync(SPECS).toSorted()) {
    if (!file.endsWith(".json")) continue;
    const spec = JSON.parse(readFileSync(join(SPECS, file), "utf8")) as Record<string, string>;
    for (const [slot, classes] of Object.entries(spec)) {
      if (classes.trim() === "") continue;
      out.set(`${basename(file, ".json")}/${slot}`, classes);
    }
  }
  return out;
}

/** Ours, as the gallery's build wrote it. */
function ourStylesheet(): string {
  const assets = resolve(import.meta.dir, "../gallery/dist/assets");
  const files = readdirSync(assets).filter((name) => name.endsWith(".css"));
  if (files.length === 0) {
    throw new Error("no built stylesheet: run `bun run gallery:build` first");
  }
  return files.map((name) => readFileSync(join(assets, name), "utf8")).join("\n");
}

/**
 * The element a selector describes, inside the ancestors it needs.
 *
 * A slot alone is not what a style targets. `attachment-size-default` is the
 * attachment carrying `data-size="default"`, and `attachment-media` is styled
 * BY its attachment, so measuring either on a bare element measures a rule that
 * never applied. The ancestry is the longest known slot that prefixes this one,
 * repeated up to the root.
 */
function nest(selector: string, known: ReadonlySet<string>): string {
  const attrs = [...selector.matchAll(/\[([a-z-]+)="([^"]*)"\]/g)]
    .map(([, name, value]) => `${name ?? ""}="${value ?? ""}"`)
    .join(" ");
  const slot = /\[data-slot="([a-z0-9-]+)"\]/.exec(selector)?.[1] ?? "";

  const chain: string[] = [];
  let rest = slot;
  for (;;) {
    const parent = [...known]
      .filter((one) => one !== rest && rest.startsWith(`${one}-`))
      .toSorted((a, b) => b.length - a.length)[0];
    if (parent === undefined) break;
    chain.push(parent);
    rest = parent;
  }

  let markup = `<div ${attrs}>x</div>`;
  for (const parent of chain) markup = `<div data-slot="${parent}">${markup}</div>`;
  return markup;
}

async function main(): Promise<void> {
  const slots = everySlot();
  const build = await createBuilder();

  // One compile for every candidate on the page, because a rule's ORDER inside
  // Tailwind's output is part of what decides the answer and compiling each
  // list on its own would lose it.
  const candidates = [...new Set([...slots.values()].flatMap((list) => list.split(/\s+/)))];
  const compiled = await build(candidates.filter(Boolean));
  // The UTILITIES only, plus what they read. Tailwind's `base` layer is a
  // reset — `*, ::before { padding: 0; margin: 0; border: 0 }` — and its layer
  // sorts after this package's, so injecting the whole sheet zeroes every atom
  // on the page and every element then reports as differing.
  const theirs =
    `@layer properties;\n` +
    print(compiled.properties) +
    "\n" +
    print(compiled.keyframes) +
    "\n" +
    print(compiled.utilities);

  mkdirSync(OUT, { recursive: true });
  // `.txt`, because the dev server that hosts the gallery turns a fetched
  // `.css` into a JS module and the page then reads one CSS rule from 123 KB.
  writeFileSync(join(OUT, "theirs.css.txt"), theirs);
  // The SELECTOR rather than the slot name, because they are not always the
  // same element: `cn-radio-group` styles the row inside the group here, and
  // comparing against the wrapper reports a difference the alias exists to
  // resolve.
  const ours = slotsWeEmit(resolve(import.meta.dir, ".."));
  const pairs: Record<string, { selector: string; classes: string }> = {};
  for (const [name, classes] of slots) {
    const slot = name.split("/")[1] ?? "";
    const selector = selectorFor(`cn-${slot}`, ours);
    if (selector !== null) pairs[name] = { selector, classes };
  }
  writeFileSync(join(OUT, "spec.json"), JSON.stringify(pairs, null, 2));
  writeFileSync(
    join(OUT, "compare.js"),
    readFileSync(resolve(import.meta.dir, "compare.js"), "utf8"),
  );
  void nest;
  void ourStylesheet;
  process.stdout.write(
    `${String(slots.size)} slots, ${String(candidates.length)} candidates -> ` +
      `${OUT}/{theirs.css.txt,spec.json,compare.js}\n`,
  );
}

if (import.meta.main) await main();
