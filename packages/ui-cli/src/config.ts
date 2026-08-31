/**
 * `components.json`: finding it, reading it, writing it back.
 *
 * At the project root rather than anywhere on the path, and the root is where
 * the file IS — so a command run from a subdirectory of a monorepo package
 * finds that package's configuration and not the workspace's.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { parseConfig, type Config } from "./schema.ts";

export const CONFIG_FILE = "components.json";

export const SCHEMA_URL = "https://github.com/salamaashoush/barq/schema/components.json";

/** The nearest directory at or above `from` holding a `components.json`. */
export function findRoot(from: string): string | undefined {
  let directory = resolve(from);
  for (;;) {
    if (existsSync(join(directory, CONFIG_FILE))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

export function readConfig(root: string): Config {
  const path = join(root, CONFIG_FILE);
  return parseConfig(JSON.parse(readFileSync(path, "utf8")));
}

/**
 * Written with the keys in a fixed order and the item table last.
 *
 * The table grows with every `add`, and a person reading the file wants to see
 * the settings they chose above the bookkeeping they did not.
 */
export function writeConfig(root: string, config: Config): void {
  const ordered = {
    $schema: config.$schema ?? SCHEMA_URL,
    registry: config.registry,
    paths: config.paths,
    theme: config.theme,
    reset: config.reset,
    items: Object.fromEntries(
      Object.entries(config.items)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([name, files]) => [
          name,
          Object.fromEntries(Object.entries(files).toSorted(([a], [b]) => a.localeCompare(b))),
        ]),
    ),
  };
  writeFileSync(join(root, CONFIG_FILE), `${JSON.stringify(ordered, null, 2)}\n`);
}

/** The config, or an error naming the command that would create one. */
export function requireConfig(cwd: string): { root: string; config: Config } {
  const root = findRoot(cwd);
  if (root === undefined) {
    throw new Error(`no ${CONFIG_FILE} here or above. Run \`barq-ui init\` first.`);
  }
  return { root, config: readConfig(root) };
}
