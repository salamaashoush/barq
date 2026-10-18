/**
 * `registry/`, from `src`.
 *
 * ```
 * bun run registry
 * ```
 *
 * A registry item is a component's SOURCE plus what it needs: the npm packages
 * it imports and the other items it imports. `@barqjs/ui-cli` fetches these and
 * writes the files into a project, so a component that has been added is the
 * project's own code, which is shadcn's whole idea.
 *
 * There is no second copy of a component to drift: `registry/button.json` holds
 * `src/ui/button.tsx` verbatim, and the suite that tests `src` is testing what
 * `add` writes.
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
 *
 * ## Blocks and charts
 *
 * They are written in the site, against this package's barrel and inside the
 * site's preview. Neither exists in a project that owns its components, so the
 * registry's copy differs from the site's file in exactly two ways, both done
 * here: an `import { … } from "@barqjs/ui"` becomes one import per file the
 * names come from, which is what makes `add dashboard-01` bring `card`,
 * `sidebar` and the rest; and `@container preview` becomes `@media`, because
 * the preview is the site's stand-in for a viewport and a project has the real
 * one.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { CATALOG } from "../../site/src/blocks/catalog.ts";
import { packageOf, specifiersIn, titleOf } from "../../ui-cli/src/build.ts";
import { THEMES } from "../src/theme/themes.ts";

const root = resolve(import.meta.dir, "..");
const site = resolve(root, "../site/src");

export type ItemType =
  | "registry:ui"
  | "registry:lib"
  | "registry:hook"
  | "registry:theme"
  | "registry:block"
  | "registry:component";

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
  readonly categories?: readonly string[];
}

const SCHEMA = "https://github.com/salamaashoush/barq/schema/registry-item.json";

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

const BARREL = "@barqjs/ui";

/**
 * Which file each of the barrel's names comes from, read off the barrel.
 *
 * `src/index.ts` is generated as one `export { … } from "./ui/card.tsx"` per
 * module, so it already is the table.
 */
function barrelExports(): Map<string, string> {
  const out = new Map<string, string>();
  const barrel = readFileSync(join(root, "src/index.ts"), "utf8");
  for (const match of barrel.matchAll(/export\s*\{([^}]*)\}\s*from\s*["']\.\/([^"']+)["']/g)) {
    for (const name of (match[1] ?? "").split(",")) {
      const bare = name.trim().replace(/^type\s+/, "");
      if (bare !== "") out.set(bare, match[2] as string);
    }
  }
  return out;
}

/** One import, wrapped the way the formatter would once it passes a hundred columns. */
function importLine(names: readonly string[], specifier: string): string {
  const flat = `import { ${names.join(", ")} } from "${specifier}";`;
  return flat.length <= 100
    ? flat
    : `import {\n${names.map((name) => `  ${name},`).join("\n")}\n} from "${specifier}";`;
}

/**
 * A site module as the registry carries it.
 *
 * `path` is where the file sits in the registry and `shared` is where each
 * site file it may import sits there, so every specifier that leaves the file
 * is rewritten against the tree a project receives.
 */
function portable(
  source: string,
  path: string,
  from: string,
  shared: ReadonlyMap<string, string>,
  exports: ReadonlyMap<string, string>,
  carried: ReadonlySet<string>,
): string {
  const here = dirname(path);
  const toward = (target: string): string => {
    const specifier = relative(here, target).replaceAll("\\", "/");
    return specifier.startsWith(".") ? specifier : `./${specifier}`;
  };

  const unbarrelled = source.replaceAll(
    new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${BARREL}["'];?`, "g"),
    (_whole, clause: string) => {
      const byFile = new Map<string, string[]>();
      for (const written of clause.split(",")) {
        const name = written.trim();
        if (name === "") continue;
        const exported = name.replace(/^type\s+/, "").split(/\s+as\s+/)[0] as string;
        const file = exports.get(exported);
        if (file === undefined) {
          throw new Error(`${from} imports ${exported} from ${BARREL}, which does not export it`);
        }
        if (!carried.has(file)) {
          throw new Error(
            `${from} imports ${exported}, which lives in ${file}: a file the registry does not carry`,
          );
        }
        byFile.set(file, [...(byFile.get(file) ?? []), name]);
      }
      return [...byFile]
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([file, names]) => importLine(names, toward(file)))
        .join("\n");
    },
  );

  const relinked = unbarrelled.replaceAll(
    /(from\s*|import\s*)(["'])(\.[^"']*)\2/g,
    (whole, lead: string, quote: string, specifier: string) => {
      const inSite = relative(site, resolve(dirname(from), specifier)).replaceAll("\\", "/");
      const target = shared.get(inSite);
      return target === undefined ? whole : `${lead}${quote}${toward(target)}${quote}`;
    },
  );

  return relinked.replaceAll("@container preview (", "@media (");
}

interface SiteSource extends Source {
  /** The file in the site, absolute. */
  readonly from: string;
  readonly title?: string;
  readonly description?: string;
  readonly categories: readonly string[];
  /** The item's own type, where it is not its file's. */
  readonly itemType?: ItemType;
}

/**
 * A `SiteSource` is a `Source` with more on it, so a list of both infers as a
 * list of `Source` and the site's half is lost to the type. Asked by name.
 */
function isSiteSource(source: Source | SiteSource): source is SiteSource {
  return "from" in source;
}

/**
 * The site's blocks and charts, and the site modules they share.
 *
 * A block is the file its catalog entry names. A chart item is one of the
 * site's chart modules, which is a whole family of charts, because that is the
 * unit they are written in: `chart-area` is every area chart. What several of
 * them import from elsewhere in the site travels as a `lib` item of its own,
 * found by following the imports rather than listed.
 */
function siteSources(): SiteSource[] {
  const blocks: SiteSource[] = CATALOG.map((block) => ({
    name: block.name,
    type: "registry:block",
    path: `blocks/${block.name}.tsx`,
    from: join(site, "blocks", `${block.name}.tsx`),
    title: block.title,
    description: block.description,
    categories: block.categories,
  }));

  const charts: SiteSource[] = readdirSync(join(site, "charts"))
    // `index.tsx` is the site's own page over the charts, with its router.
    .filter((entry) => /\.tsx?$/.test(entry) && !entry.includes(".test.") && entry !== "index.tsx")
    .toSorted()
    .map((entry) => {
      const base = entry.replace(/\.tsx?$/, "");
      return {
        name: `chart-${base}`,
        type: "registry:component",
        itemType: "registry:block",
        path: `charts/${entry}`,
        from: join(site, "charts", entry),
        categories: ["charts"],
      };
    });

  const own = new Set([...blocks, ...charts].map((source) => source.from));
  const libs = new Map<string, SiteSource>();
  for (const source of [...blocks, ...charts]) {
    for (const specifier of specifiersIn(readFileSync(source.from, "utf8"))) {
      if (!specifier.startsWith(".")) continue;
      const from = resolve(dirname(source.from), specifier);
      if (own.has(from) || libs.has(from)) continue;
      const entry = from.split("/").at(-1) as string;
      libs.set(from, {
        name: entry.replace(/\.tsx?$/, ""),
        type: "registry:lib",
        path: `lib/${entry}`,
        from,
        categories: [],
      });
    }
  }

  return [...libs.values(), ...blocks, ...charts];
}

function main(): void {
  const sources = [
    ...sourcesIn("theme", "registry:theme"),
    ...sourcesIn("lib", "registry:lib"),
    ...sourcesIn("hooks", "registry:hook"),
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

  const fromSite = siteSources();
  const exports = barrelExports();
  const carried = new Set(owner.keys());
  const shared = new Map<string, string>();
  for (const source of fromSite) {
    if (owner.has(source.path)) {
      throw new Error(`${source.from} and src/${source.path} would be the same registry file`);
    }
    owner.set(source.path, source.name);
    shared.set(relative(site, source.from).replaceAll("\\", "/"), source.path);
  }
  // Served beside the items under these names, so no item may take one.
  const data = new Set(["index", "themes", "styles"]);
  const names = new Set<string>();
  for (const name of owner.values()) {
    if (data.has(name) || name.startsWith("style-")) {
      throw new Error(`"${name}" is a name the registry serves data under`);
    }
    if (names.has(name)) throw new Error(`two registry items are named "${name}"`);
    names.add(name);
  }

  const every: readonly (Source | SiteSource)[] = [...items, ...fromSite];
  const built: RegistryItem[] = every.map((source) => {
    const described = isSiteSource(source) ? source : undefined;
    const content =
      described === undefined
        ? readFileSync(join(root, "src", source.path), "utf8")
        : portable(
            readFileSync(described.from, "utf8"),
            described.path,
            described.from,
            shared,
            exports,
            carried,
          );
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

    const description = described?.description ?? descriptionOf(content);
    const categories = described?.categories ?? [];
    return {
      $schema: SCHEMA,
      name: source.name,
      type: described?.itemType ?? source.type,
      title: described?.title ?? titleOf(source.name),
      ...(description === undefined ? {} : { description }),
      dependencies: [...dependencies].toSorted(),
      registryDependencies: [...registryDependencies].toSorted(),
      files: [{ path: source.path, type: source.type, content }],
      ...(categories.length === 0 ? {} : { categories }),
    };
  });

  // What each file exports by name, so a page can show an import of the
  // package's barrel as imports of the files a project holds.
  const exportedBy = new Map<string, string[]>();
  for (const [name, file] of exports) exportedBy.set(file, [...(exportedBy.get(file) ?? []), name]);
  const exportsOf = (item: RegistryItem): { exports?: string[] } => {
    const exported = item.files.flatMap((file) => exportedBy.get(file.path) ?? []);
    return exported.length === 0 ? {} : { exports: exported.toSorted() };
  };

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
          ...(item.categories === undefined ? {} : { categories: item.categories }),
          ...exportsOf(item),
        })),
      },
      null,
      2,
    )}\n`,
  );

  // The colour themes and the component styles, as data beside the items: the
  // CLI writes the chosen theme as source and copies the chosen style whole.
  writeFileSync(join(out, "themes.json"), `${JSON.stringify(THEMES, null, 2)}\n`);
  const styles = readdirSync(join(root, "styles"))
    .filter((file) => file.endsWith(".css"))
    .map((file) => file.replace(/\.css$/, ""))
    .toSorted();
  writeFileSync(join(out, "styles.json"), `${JSON.stringify(styles, null, 2)}\n`);
  for (const name of styles) {
    const css = readFileSync(join(root, "styles", `${name}.css`), "utf8");
    writeFileSync(join(out, `style-${name}.json`), `${JSON.stringify({ name, css }, null, 2)}\n`);
  }

  process.stdout.write(
    `${built.length} items, ${THEMES.length} themes and ${styles.length} styles -> registry/\n`,
  );
}

main();
