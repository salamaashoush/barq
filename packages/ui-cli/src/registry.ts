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
 *
 * `registries` in `components.json` names more of them, and an item from one
 * is addressed as `@scope/name`.
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

import {
  parseIndex,
  parseItem,
  type Config,
  type RegistryEndpoint,
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

/** `${NAME}` from the environment, so a token never has to be written down. */
function expand(value: string, where: string): string {
  return value.replaceAll(/\$\{(\w+)\}/g, (_whole, name: string) => {
    const found = process.env[name];
    if (found === undefined) throw new Error(`${where} reads \${${name}}, which is not set`);
    return found;
  });
}

/**
 * A registry behind a pattern with `{name}` in it: a URL, or a path.
 *
 * A path is what `build` leaves behind, so a registry can be used from the
 * directory it was built into before anything serves it.
 */
function fromPattern(endpoint: RegistryEndpoint, cwd: string, where: string): Source {
  const remote = /^https?:\/\//.test(endpoint.url);
  const at = (name: string): string => {
    const filled = expand(endpoint.url, where).replaceAll("{name}", name);
    return remote ? filled : resolve(cwd, filled);
  };

  const get = async (name: string): Promise<unknown> => {
    const location = at(name);
    if (!remote) {
      if (!existsSync(location)) throw new Error(`no item named "${name}" at ${location}`);
      return JSON.parse(readFileSync(location, "utf8"));
    }
    const response = await fetch(location, {
      headers: Object.fromEntries(
        Object.entries(endpoint.headers).map(([key, value]) => [key, expand(value, where)]),
      ),
    });
    if (!response.ok) {
      throw new Error(`${location} answered ${String(response.status)} ${response.statusText}`);
    }
    return await response.json();
  };

  return {
    describe: endpoint.url,
    index: async () => parseIndex(await get("index")),
    item: async (name) => parseItem(await get(name), name),
  };
}

export function sourceFor(config: Config, cwd: string): Source {
  if (config.registry !== "node_modules") {
    return fromPattern({ url: config.registry, headers: {} }, cwd, "components.json.registry");
  }

  const directory = localRegistry(cwd);
  if (directory === undefined) {
    throw new Error(
      'the registry is "node_modules" and @barqjs/ui is not installed here.\n' +
        "Install it, or point `registry` at a URL containing {name}.",
    );
  }
  return fromDirectory(directory);
}

export interface Located {
  readonly source: Source;
  /** What the item is called where it lives, without the scope. */
  readonly name: string;
}

export interface Registries {
  /** The scopes `components.json` names, for a command that reads every registry. */
  readonly scopes: readonly string[];
  /** The project's own registry, or the one a scope names. */
  source(scope?: string): Source;
  /** `button` is the project's own registry; `@acme/button` is the one named `@acme`. */
  locate(address: string): Located;
}

/**
 * The project's registry and the ones it names, each opened when first asked for.
 *
 * Lazily, because the default one throws when `@barqjs/ui` is not installed,
 * and a project that only ever adds `@acme/…` should not need it to be.
 */
export function registriesFor(config: Config, cwd: string): Registries {
  const opened = new Map<string, Source>();

  const source = (scope?: string): Source => {
    const key = scope ?? "";
    const found = opened.get(key);
    if (found !== undefined) return found;

    let made: Source;
    if (scope === undefined) made = sourceFor(config, cwd);
    else {
      const endpoint = config.registries[scope];
      if (endpoint === undefined) {
        const known = Object.keys(config.registries).toSorted();
        throw new Error(
          `no registry named "${scope}" in components.json.` +
            (known.length === 0 ? " Add it under `registries`." : ` It has: ${known.join(", ")}`),
        );
      }
      made = fromPattern(endpoint, cwd, `components.json.registries.${scope}`);
    }
    opened.set(key, made);
    return made;
  };

  return {
    scopes: Object.keys(config.registries).toSorted(),
    source,
    locate(address) {
      if (!address.startsWith("@")) return { source: source(), name: address };

      const split = address.indexOf("/");
      const scope = split < 0 ? address : address.slice(0, split);
      const found = source(scope);
      if (split < 0 || split === address.length - 1) {
        throw new Error(`"${address}" names a registry and no item in it`);
      }
      return { source: found, name: address.slice(split + 1) };
    },
  };
}

/**
 * Every item these addresses need, dependencies first.
 *
 * Depth-first with a seen set, so a diamond — `dialog` and `sheet` both wanting
 * `button` — resolves once, and a cycle terminates rather than recursing until
 * the stack goes.
 *
 * An item from a named registry is recorded under its whole address, so
 * `@acme/button` and the project's own `button` are two items rather than one
 * overwriting the other. A bare dependency always means the project's own
 * registry, whichever registry the item asking for it came from.
 */
export async function resolveItems(
  registries: Registries,
  addresses: readonly string[],
): Promise<RegistryItem[]> {
  const seen = new Set<string>();
  const out: RegistryItem[] = [];

  const visit = async (address: string): Promise<void> => {
    if (seen.has(address)) return;
    seen.add(address);
    const { source, name } = registries.locate(address);
    const item = await source.item(name);
    for (const dependency of item.registryDependencies) await visit(dependency);
    out.push(item.name === address ? item : { ...item, name: address });
  };

  for (const address of addresses) await visit(address);
  return out;
}
