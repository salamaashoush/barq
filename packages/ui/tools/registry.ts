/**
 * `registry/`, from `src`.
 *
 * ```
 * bun run registry
 * ```
 *
 * A registry item is a component's SOURCE plus what it needs: the npm packages
 * it imports and the other items it imports. `@barqjs/ui-cli` reads these and
 * writes the files into a project, so a component that has been added is the
 * project's own code — which is shadcn's whole idea and the reason this package
 * ships as a library AND as a registry.
 *
 * Both halves come from the same files. There is no second copy of a component
 * to drift: `registry/button.json` holds `src/ui/button.tsx` verbatim, and the
 * suite that tests the library is testing what `add` writes.
 *
 * ## What it works out for itself
 *
 * **Dependencies** are the bare specifiers a file imports, minus the ones this
 * package resolves itself. `@barqjs/lucide/icons/check` is recorded as
 * `@barqjs/lucide`, because that is what you install.
 *
 * **Registry dependencies** are the relative imports, by the name of the item
 * that owns the file. `../lib/slot.ts` is `slot`; `./button.tsx` is `button`.
 * The CLI walks them, so `add dialog` brings `button`, `slot`, `props` and the
 * theme without being told.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { THEMES } from "../src/theme/themes.ts";

const root = resolve(import.meta.dir, "..");

export type ItemType = "registry:ui" | "registry:lib" | "registry:theme";

export interface RegistryFile {
  /** Where it goes, relative to the target directory the CLI resolves. */
  readonly path: string;
  readonly type: ItemType;
  readonly content: string;
}

export interface RegistryItem {
  readonly $schema: string;
  readonly name: string;
  readonly type: ItemType;
  readonly title: string;
  readonly description?: string;
  readonly dependencies: readonly string[];
  readonly registryDependencies: readonly string[];
  readonly files: readonly RegistryFile[];
}

const SCHEMA = "https://github.com/salamaashoush/barq/schema/registry-item.json";

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

function specifiersIn(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(IMPORT)) {
    const specifier = match[1] ?? match[2];
    if (specifier !== undefined) out.push(specifier);
  }
  return out;
}

/** `@barqjs/lucide/icons/check` -> `@barqjs/lucide`. What you install. */
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

/**
 * The first sentence of a module's own doc comment.
 *
 * Only a comment that starts the FILE: a component's exported doc belongs to
 * the export, and lifting it here would describe one of several things the item
 * contains.
 */
function descriptionOf(source: string): string | undefined {
  const match = /^\/\*\*\n([\s\S]*?)\n \*\//.exec(source);
  if (match === null) return undefined;
  const body = (match[1] ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*\* ?/, ""))
    .join("\n")
    .trim();
  const sentence = body.split("\n\n")[0]?.replaceAll("\n", " ").trim();
  return sentence === undefined || sentence === "" ? undefined : sentence;
}

interface Source {
  readonly name: string;
  readonly type: ItemType;
  /** `ui/button.tsx` — the path inside the target directory, and inside `src`. */
  readonly path: string;
}

function sourcesIn(directory: string, type: ItemType): Source[] {
  return readdirSync(join(root, "src", directory))
    .filter((entry) => /\.tsx?$/.test(entry) && !entry.includes(".test."))
    .toSorted()
    .map((entry) => ({
      name: entry.replace(/\.tsx?$/, ""),
      type,
      path: `${directory}/${entry}`,
    }));
}

function main(): void {
  const sources = [
    ...sourcesIn("theme", "registry:theme"),
    ...sourcesIn("lib", "registry:lib"),
    ...sourcesIn("ui", "registry:ui"),
  ];

  // Three that a project has no use for. `themes.ts` is a thousand lines of
  // colour data nobody edits, and the CLI writes the CHOSEN theme into the
  // project instead; `install.ts` reads it at run time, which a project with a
  // compiled theme does not do; `index.ts` is the library's barrel, and a
  // project imports its own files by path.
  const skipped = new Set(["themes", "install", "index", "entries"]);
  const items = sources.filter((source) => !skipped.has(source.name));

  const owner = new Map<string, string>();
  for (const source of items) owner.set(source.path, source.name);

  const built: RegistryItem[] = items.map((source) => {
    const content = readFileSync(join(root, "src", source.path), "utf8");
    const dependencies = new Set<string>();
    const registryDependencies = new Set<string>();

    for (const specifier of specifiersIn(content)) {
      if (!specifier.startsWith(".")) {
        dependencies.add(packageOf(specifier));
        continue;
      }
      const resolved = resolve(join(root, "src", source.path), "..", specifier)
        .slice(join(root, "src").length + 1)
        .replaceAll("\\", "/");
      const name = owner.get(resolved);
      if (name !== undefined && name !== source.name) registryDependencies.add(name);
    }

    const description = descriptionOf(content);
    return {
      $schema: SCHEMA,
      name: source.name,
      type: source.type,
      title: titleOf(source.name),
      ...(description === undefined ? {} : { description }),
      dependencies: [...dependencies].toSorted(),
      registryDependencies: [...registryDependencies].toSorted(),
      files: [{ path: source.path, type: source.type, content }],
    };
  });

  const out = join(root, "registry");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  for (const item of built) {
    writeFileSync(join(out, `${item.name}.json`), `${JSON.stringify(item, null, 2)}\n`);
  }

  writeFileSync(
    join(out, "index.json"),
    `${JSON.stringify(
      {
        $schema: "https://github.com/salamaashoush/barq/schema/registry.json",
        name: "@barqjs/ui",
        homepage: "https://github.com/salamaashoush/barq",
        items: built.map((item) => ({
          name: item.name,
          type: item.type,
          title: item.title,
          ...(item.description === undefined ? {} : { description: item.description }),
          dependencies: item.dependencies,
          registryDependencies: item.registryDependencies,
          files: item.files.map((file) => file.path),
        })),
      },
      null,
      2,
    )}\n`,
  );

  // The colour themes, as DATA beside the items.
  //
  // `barq-ui init` used to `import()` them out of this package's `dist`, which
  // stopped existing when the package began publishing source: a compiled build
  // is specific to one backend and one `hydratable`, so there is nothing for a
  // CLI to import. A table of colours needs no compiling, and `registry/` is
  // already the channel the CLI reads.
  writeFileSync(join(out, "themes.json"), `${JSON.stringify(THEMES, null, 2)}\n`);

  process.stdout.write(`${built.length} items and ${THEMES.length} themes -> registry/\n`);
}

main();
