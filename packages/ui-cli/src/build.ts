/**
 * `build`: a directory of components, as a registry someone else can `add`.
 *
 * The same rules `@barqjs/ui` builds its own with — a file's bare imports are
 * its npm dependencies, its relative imports are the items it needs — so a
 * registry of your own works the same way and can depend on this one's items by
 * name.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import type { ItemType, RegistryItem } from "./schema.ts";

const IMPORT =
  /(?:^|\n)\s*(?:import|export)\b[^;\n]*?\bfrom\s*["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;

function specifiersIn(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(IMPORT)) {
    const specifier = match[1] ?? match[2];
    if (specifier !== undefined) out.push(specifier);
  }
  return out;
}

function packageOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
}

function titleOf(name: string): string {
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

function typeOf(path: string): ItemType {
  const first = path.includes("/") ? path.split("/")[0] : "";
  if (first === "lib") return "registry:lib";
  if (first === "theme") return "registry:theme";
  return "registry:ui";
}

export function buildRegistry(from: string, to: string): number {
  const paths = sourcesIn(from);
  const owner = new Map<string, string>();
  for (const path of paths)
    owner.set(path, (path.split("/").at(-1) ?? path).replace(/\.tsx?$/, ""));

  const items: RegistryItem[] = paths.map((path) => {
    const content = readFileSync(join(from, path), "utf8");
    const name = owner.get(path) as string;
    const dependencies = new Set<string>();
    const registryDependencies = new Set<string>();

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

    return {
      name,
      type: typeOf(path),
      title: titleOf(name),
      dependencies: [...dependencies].toSorted(),
      registryDependencies: [...registryDependencies].toSorted(),
      files: [{ path, type: typeOf(path), content }],
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
