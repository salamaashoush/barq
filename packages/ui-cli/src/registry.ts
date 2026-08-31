/**
 * Where an item comes from, and what else it needs.
 *
 * Two sources, and the difference is one line of configuration:
 *
 * - **`node_modules`**, the default. The copy of `@barqjs/ui` the project has
 *   already installed. A monorepo, a pinned version and a machine with no
 *   network all work, and what `add` writes is exactly the version in the
 *   lockfile — which a URL cannot promise.
 * - **A URL** with `{name}` in it, for a registry of your own. `build` in this
 *   CLI produces the files it serves.
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

import {
  parseIndex,
  parseItem,
  type Config,
  type RegistryIndex,
  type RegistryItem,
} from "./schema.ts";

export interface Source {
  index(): Promise<RegistryIndex>;
  item(name: string): Promise<RegistryItem>;
  readonly describe: string;
}

/** The directory `@barqjs/ui`'s own files are in, resolved from the PROJECT. */
export function localPackage(cwd: string): string | undefined {
  // `createRequire` from a path INSIDE the project, so resolution walks the
  // project's own `node_modules` rather than this CLI's.
  const require_ = createRequire(join(resolve(cwd), "package.json"));
  try {
    return dirname(require_.resolve("@barqjs/ui/package.json"));
  } catch {
    return undefined;
  }
}

/** The eight stylesheets that package ships, by name. */
export function localStyles(cwd: string): string | undefined {
  const root = localPackage(cwd);
  if (root === undefined) return undefined;
  const directory = join(root, "styles");
  return existsSync(directory) ? directory : undefined;
}

/** The directory `@barqjs/ui`'s registry is in, resolved from the project. */
export function localRegistry(cwd: string): string | undefined {
  // `createRequire` from a path INSIDE the project, so resolution walks the
  // project's own `node_modules` rather than this CLI's.
  const require_ = createRequire(join(resolve(cwd), "package.json"));
  try {
    const manifest = require_.resolve("@barqjs/ui/package.json");
    const directory = join(dirname(manifest), "registry");
    return existsSync(join(directory, "index.json")) ? directory : undefined;
  } catch {
    return undefined;
  }
}

function fromDirectory(directory: string): Source {
  return {
    describe: directory,
    index: async () => parseIndex(JSON.parse(readFileSync(join(directory, "index.json"), "utf8"))),
    item: async (name) => {
      const path = join(directory, `${name}.json`);
      if (!existsSync(path)) throw new Error(`no item named "${name}" in ${directory}`);
      return parseItem(JSON.parse(readFileSync(path, "utf8")), name);
    },
  };
}

function fromUrl(pattern: string): Source {
  const at = (name: string): string => pattern.replaceAll("{name}", name);
  const get = async (url: string): Promise<unknown> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url} answered ${String(response.status)} ${response.statusText}`);
    }
    return await response.json();
  };

  return {
    describe: pattern,
    index: async () => parseIndex(await get(at("index"))),
    item: async (name) => parseItem(await get(at(name)), name),
  };
}

export function sourceFor(config: Config, cwd: string): Source {
  if (config.registry !== "node_modules") return fromUrl(config.registry);

  const directory = localRegistry(cwd);
  if (directory === undefined) {
    throw new Error(
      'the registry is "node_modules" and @barqjs/ui is not installed here.\n' +
        "Install it, or point `registry` at a URL containing {name}.",
    );
  }
  return fromDirectory(directory);
}

/**
 * Every item these names need, dependencies first.
 *
 * Depth-first with a seen set, so a diamond — `dialog` and `sheet` both wanting
 * `button` — resolves once, and a cycle terminates rather than recursing until
 * the stack goes.
 */
export async function resolveItems(
  source: Source,
  names: readonly string[],
): Promise<RegistryItem[]> {
  const seen = new Set<string>();
  const out: RegistryItem[] = [];

  const visit = async (name: string): Promise<void> => {
    if (seen.has(name)) return;
    seen.add(name);
    const item = await source.item(name);
    for (const dependency of item.registryDependencies) await visit(dependency);
    out.push(item);
  };

  for (const name of names) await visit(name);
  return out;
}
