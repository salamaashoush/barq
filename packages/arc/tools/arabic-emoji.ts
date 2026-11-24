/**
 * Writes `src/chat/emoji-ar.json`: CLDR's Arabic names and keywords for the
 * emoji emojibase lists, which has no Arabic file of its own.
 *
 *   bun run tools/arabic-emoji.ts                  # fetched from cldr-json at CLDR
 *   bun run tools/arabic-emoji.ts base.json derived.json
 *
 * CLDR's annotations are under the Unicode License v3, whose notice the
 * written file carries.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CLDR = "48.0.0";
const ROOT = `https://raw.githubusercontent.com/unicode-org/cldr-json/${CLDR}/cldr-json`;
const BASE = `${ROOT}/cldr-annotations-full/annotations/ar/annotations.json`;
const DERIVED = `${ROOT}/cldr-annotations-derived-full/annotationsDerived/ar/annotations.json`;

const NOTICE =
  "Emoji names and keywords from the Unicode CLDR (https://cldr.unicode.org), " +
  `version ${CLDR}. Copyright © 2015-2024 Unicode, Inc. Distributed under the Unicode ` +
  "License v3: https://www.unicode.org/license.txt";

interface AnnotationLists {
  default?: string[];
  tts?: string[];
}

interface Annotations {
  [emoji: string]: AnnotationLists;
}

interface Compact {
  unicode: string;
  hexcode: string;
  group?: number;
}

interface AnnotationsFile {
  annotations: Annotations;
}

async function read(path: string | undefined, url: string): Promise<Annotations> {
  const text = path === undefined ? await (await fetch(url)).text() : readFileSync(path, "utf8");
  const json = JSON.parse(text) as Record<string, AnnotationsFile>;
  const top = json.annotations ?? json.annotationsDerived;
  if (top === undefined) throw new Error(`no annotations in ${path ?? url}`);
  return top.annotations;
}

const [basePath, derivedPath] = process.argv.slice(2);
const annotations: Annotations = {
  ...(await read(derivedPath, DERIVED)),
  ...(await read(basePath, BASE)),
};

const english = JSON.parse(
  readFileSync(fileURLToPath(import.meta.resolve("emojibase-data/en/compact.json")), "utf8"),
) as Compact[];

// CLDR's keys leave out the variation selector emojibase writes.
function bare(text: string): string {
  return text.replaceAll("️", "");
}
const byBare = new Map(Object.entries(annotations).map(([key, value]) => [bare(key), value]));

const emoji: Record<string, string[]> = {};
let missing = 0;
for (const one of english) {
  if (one.group === undefined || one.group === 2) continue;
  const found = byBare.get(bare(one.unicode));
  const label = found?.tts?.[0];
  if (found === undefined || label === undefined) {
    missing += 1;
    continue;
  }
  emoji[one.hexcode] = [label, ...(found.default ?? []).filter((tag) => tag !== label)];
}

const out = fileURLToPath(new URL("../src/chat/emoji-ar.json", import.meta.url));
writeFileSync(out, `${JSON.stringify({ notice: NOTICE, cldr: CLDR, emoji })}\n`);
// In the repository's format, which its check holds every file under src to.
const formatted = Bun.spawnSync(["bunx", "oxfmt", out], { stdout: "ignore", stderr: "inherit" });
if (formatted.exitCode !== 0) throw new Error("oxfmt could not format the written file");
console.log(
  `${String(Object.keys(emoji).length)} emoji named, ${String(missing)} left in English -> ${out}`,
);
