/**
 * `build`: a directory of components, as a registry someone else can `add`.
 *
 * The same rules `@barqjs/ui` builds its own with — a file's bare imports are
 * its npm dependencies, its relative imports are the items it needs — so a
 * registry of your own works the same way and can depend on this one's items by
 * name.
 *
 * The directory a file is in says what it is: `lib`, `theme`, `hooks`,
 * `blocks`, `components` and `examples` are each their own type, and anything
 * else is a `ui` component.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import type { ItemType, RegistryItem } from "./schema.ts";

/**
 * `import … from "x"`, `export … from "x"` and a bare `import "x"`.
 *
 * `from` is required rather than "the first quoted string on the line", which
 * is what this used to be: `export type ButtonVariant = "default" | …` then
 * declared a dependency on a package called `default`.
 *
 * What stands between the keyword and `from` is an import CLAUSE and nothing
 * else — names, braces, commas, `*`, whitespace. Matching "anything up to the
 * end of the line" instead missed every import long enough to be wrapped, and
 * that is most of them: `context-menu.tsx` declared no dependency on
 * `@barqjs/aria` and none on `dropdown-menu`, so `add context-menu` wrote a
 * file that imports a component the project does not have.
 */
const IMPORT =
  /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?[\w*{}\s,$]+?\s*\bfrom\s*["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;

export function specifiersIn(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(IMPORT)) {
    const specifier = match[1] ?? match[2];
    if (specifier !== undefined) out.push(specifier);
  }
  return out;
}

/** `@barqjs/lucide/icons/check` -> `@barqjs/lucide`. What you install. */
export function packageOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
}

export function titleOf(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Every `.ts`/`.tsx` under `directory`, excluding tests, as paths relative to it. */
function sourcesIn(directory: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).toSorted((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sourcesIn(join(directory, entry.name), path));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) out.push(path);
  }
  return out;
}

const DIRECTORIES: Readonly<Record<string, ItemType>> = {
  lib: "registry:lib",
  theme: "registry:theme",
  hooks: "registry:hook",
  blocks: "registry:block",
  components: "registry:component",
  examples: "registry:example",
};

function typeOf(path: string): ItemType {
  const first = path.includes("/") ? (path.split("/")[0] ?? "") : "";
  return DIRECTORIES[first] ?? "registry:ui";
}

/**
 * The item a file belongs to.
 *
 * A file is an item of its own, named for the file. A DIRECTORY under `blocks`
 * is one item with everything in it, because that is what a block is: a page
 * and the components only that page uses.
 */
function ownerOf(path: string): string {
  const parts = path.split("/");
  if (parts[0] === "blocks" && parts.length > 2) return parts[1] as string;
  return (parts.at(-1) ?? path).replace(/\.tsx?$/, "");
}

export function buildRegistry(from: string, to: string): number {
  const paths = sourcesIn(from);
  const owner = new Map<string, string>();
  for (const path of paths) owner.set(path, ownerOf(path));

  const grouped = new Map<string, string[]>();
  for (const path of paths) {
    const name = owner.get(path) as string;
    grouped.set(name, [...(grouped.get(name) ?? []), path]);
  }

  const items: RegistryItem[] = [...grouped].map(([name, own]) => {
    const dependencies = new Set<string>();
    const registryDependencies = new Set<string>();
    const files = own.map((path) => {
      const content = readFileSync(join(from, path), "utf8");

      for (const specifier of specifiersIn(content)) {
        if (!specifier.startsWith(".")) {
          dependencies.add(packageOf(specifier));
          continue;
        }
        const resolved = relative(from, resolve(join(from, dirname(path)), specifier)).replaceAll(
          "\\",
          "/",
        );
        const found = owner.get(resolved);
        if (found !== undefined && found !== name) registryDependencies.add(found);
      }

      return { path, type: typeOf(path), content };
    });

    return {
      name,
      type: typeOf(own[0] as string),
      title: titleOf(name),
      dependencies: [...dependencies].toSorted(),
      devDependencies: [],
      registryDependencies: [...registryDependencies].toSorted(),
      files,
      categories: [],
    };
  });

  mkdirSync(to, { recursive: true });
  for (const item of items) {
    writeFileSync(join(to, `${item.name}.json`), `${JSON.stringify(item, null, 2)}\n`);
  }
  writeFileSync(
    join(to, "index.json"),
    `${JSON.stringify(
      {
        name: "registry",
        items: items.map((item) => ({
          name: item.name,
          type: item.type,
          title: item.title,
          dependencies: item.dependencies,
          registryDependencies: item.registryDependencies,
          files: item.files.map((file) => file.path),
        })),
      },
      null,
      2,
    )}\n`,
  );

  return items.length;
}
