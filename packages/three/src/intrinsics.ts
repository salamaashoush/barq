/**
 * The tags of the catalogue, as the build writes them to
 * `dist/intrinsics.json` for the compiler: the lowered name of every
 * constructible class `three` exports, the `three`-prefixed names of those the
 * document also uses, and `primitive`.
 */

import type { DocumentTagClashes } from "./web-jsx.ts";

const CLASHES: readonly DocumentTagClashes[] = ["audio", "source", "line", "path"];

export function isCatalogueClass(name: string, value: unknown): boolean {
  return (
    /^[A-Z]/.test(name) &&
    typeof value === "function" &&
    (value as { prototype?: unknown }).prototype !== undefined
  );
}

export function catalogueTags(exports: Record<string, unknown>): string[] {
  const tags = new Set<string>(["primitive"]);
  for (const name of Object.keys(exports)) {
    if (!isCatalogueClass(name, exports[name])) continue;
    const tag = name.charAt(0).toLowerCase() + name.slice(1);
    tags.add(tag);
    if ((CLASHES as readonly string[]).includes(tag)) tags.add(`three${name}`);
  }
  return [...tags].toSorted();
}
