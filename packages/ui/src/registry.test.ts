/**
 * The registry names everything a component imports.
 *
 * `registry.ts` finds imports with a regex, and the one it had could not see
 * past the end of a line — so every import long enough to be wrapped was
 * invisible, and fourteen items shipped without dependencies they cannot run
 * without. `add slider` installed no `@barqjs/aria`; `add context-menu` wrote a
 * file importing a `dropdown-menu` the project did not have.
 *
 * The check here reads the registry back and finds the imports itself, with a
 * rule too simple to share the bug: every `from "…"` in the file, wherever it
 * is and however it is wrapped.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

interface Item {
  name: string;
  dependencies: string[];
  registryDependencies: string[];
  files: { path: string; content: string }[];
}

const REGISTRY = resolve(import.meta.dir, "../registry");

/** Everything in `registry/` that is data rather than a component. */
const NOT_ITEMS = new Set(["index.json", "themes.json"]);

const items: Item[] = readdirSync(REGISTRY)
  // `index.json` is the listing and `themes.json` is the colour table the CLI
  // reads; neither is an item, and reading them as one is a `files of
  // undefined` with no name attached.
  .filter((entry) => entry.endsWith(".json") && !NOT_ITEMS.has(entry))
  .toSorted()
  .map((entry) => JSON.parse(readFileSync(join(REGISTRY, entry), "utf8")) as Item);

const owner = new Map<string, string>();
for (const item of items) {
  for (const file of item.files) owner.set(file.path, item.name);
}

function specifiersIn(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(/from\s*["']([^"']+)["']/g)) out.push(match[1] ?? "");
  for (const match of source.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g)) {
    out.push(match[1] ?? "");
  }
  return out;
}

function packageOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
}

describe("every registry item", () => {
  for (const item of items) {
    test(`${item.name} names what it imports`, () => {
      const packages = new Set<string>();
      const needed = new Set<string>();

      for (const file of item.files) {
        for (const specifier of specifiersIn(file.content)) {
          if (!specifier.startsWith(".")) {
            packages.add(packageOf(specifier));
            continue;
          }
          const resolved = resolve(`/${file.path}`, "..", specifier).slice(1);
          const name = owner.get(resolved);
          if (name !== undefined && name !== item.name) needed.add(name);
        }
      }

      expect([...packages].toSorted()).toEqual(item.dependencies.toSorted());
      expect([...needed].toSorted()).toEqual(item.registryDependencies.toSorted());
    });
  }
});
