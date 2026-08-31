/**
 * What a registry serves and what a project records, as types and as checks.
 *
 * Hand-written rather than a schema library, for the reason the whole package
 * has no dependencies: a validator here runs once per command over a file
 * measured in kilobytes, and the error messages a hand-written one produces
 * name the field a person has to fix.
 */

export type ItemType = "registry:ui" | "registry:lib" | "registry:theme";

export interface RegistryFile {
  /** Where it goes, relative to the directory its type resolves to. */
  readonly path: string;
  readonly type: ItemType;
  readonly content: string;
}

export interface RegistryItem {
  readonly name: string;
  readonly type: ItemType;
  readonly title: string;
  readonly description?: string;
  /** npm packages to install. */
  readonly dependencies: readonly string[];
  /** Other items to add first. */
  readonly registryDependencies: readonly string[];
  readonly files: readonly RegistryFile[];
}

export interface RegistryIndexEntry {
  readonly name: string;
  readonly type: ItemType;
  readonly title: string;
  readonly description?: string;
  readonly dependencies: readonly string[];
  readonly registryDependencies: readonly string[];
  readonly files: readonly string[];
}

export interface RegistryIndex {
  readonly name: string;
  readonly homepage?: string;
  readonly items: readonly RegistryIndexEntry[];
}

export interface ThemeChoice {
  /** A name from the registry's base themes. */
  readonly base: string;
  /** A name from its accent themes, layered over the base. */
  readonly accent?: string;
  /** `--radius`. */
  readonly radius?: string;
  /** How dark mode is asked for: a selector, or `"media"`. */
  readonly dark?: string;
}

export interface Paths {
  readonly ui: string;
  readonly lib: string;
  readonly theme: string;
}

export interface Config {
  readonly $schema?: string;
  /**
   * Where items come from.
   *
   * A URL with `{name}` in it, or `"node_modules"` to read the copy of
   * `@barqjs/ui` this project already has — which is what a monorepo and an
   * offline machine both want.
   */
  readonly registry: string;
  readonly paths: Paths;
  readonly theme: ThemeChoice;
  /** Whether `init` wrote the reset. Recorded so `sync` knows what to keep. */
  readonly reset: boolean;
  /**
   * What has been written, and the hash it was written with.
   *
   * This is what makes `sync` safe: a file whose hash still matches has not
   * been touched and can be replaced without asking, and one that has been
   * edited is shown as a diff instead. shadcn has no equivalent and cannot
   * tell the two apart.
   */
  readonly items: Record<string, Record<string, string>>;
}

const TYPES = new Set<string>(["registry:ui", "registry:lib", "registry:theme"]);

function fail(message: string): never {
  throw new Error(message);
}

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${where} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, where: string): string {
  if (typeof value !== "string") fail(`${where} must be a string`);
  return value;
}

function list(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) fail(`${where} must be an array`);
  return value;
}

function itemType(value: unknown, where: string): ItemType {
  const name = text(value, where);
  if (!TYPES.has(name)) fail(`${where} must be one of ${[...TYPES].join(", ")}, not "${name}"`);
  return name as ItemType;
}

export function parseItem(value: unknown, where = "the item"): RegistryItem {
  const entry = record(value, where);
  const name = text(entry["name"], `${where}.name`);
  return {
    name,
    type: itemType(entry["type"], `${where}.type`),
    title: typeof entry["title"] === "string" ? entry["title"] : name,
    ...(typeof entry["description"] === "string" ? { description: entry["description"] } : {}),
    dependencies: list(entry["dependencies"] ?? [], `${where}.dependencies`).map((one, index) =>
      text(one, `${where}.dependencies[${String(index)}]`),
    ),
    registryDependencies: list(
      entry["registryDependencies"] ?? [],
      `${where}.registryDependencies`,
    ).map((one, index) => text(one, `${where}.registryDependencies[${String(index)}]`)),
    files: list(entry["files"] ?? [], `${where}.files`).map((one, index) => {
      const file = record(one, `${where}.files[${String(index)}]`);
      return {
        path: text(file["path"], `${where}.files[${String(index)}].path`),
        type: itemType(file["type"], `${where}.files[${String(index)}].type`),
        content: text(file["content"], `${where}.files[${String(index)}].content`),
      };
    }),
  };
}

export function parseIndex(value: unknown): RegistryIndex {
  const entry = record(value, "the registry");
  return {
    name: text(entry["name"] ?? "registry", "the registry's name"),
    ...(typeof entry["homepage"] === "string" ? { homepage: entry["homepage"] } : {}),
    items: list(entry["items"] ?? [], "the registry's items").map((one, index) => {
      const item = record(one, `items[${String(index)}]`);
      const name = text(item["name"], `items[${String(index)}].name`);
      return {
        name,
        type: itemType(item["type"], `items[${String(index)}].type`),
        title: typeof item["title"] === "string" ? item["title"] : name,
        ...(typeof item["description"] === "string" ? { description: item["description"] } : {}),
        dependencies: list(item["dependencies"] ?? [], "dependencies").map((one_, at) =>
          text(one_, `items[${String(index)}].dependencies[${String(at)}]`),
        ),
        registryDependencies: list(item["registryDependencies"] ?? [], "registryDependencies").map(
          (one_, at) => text(one_, `items[${String(index)}].registryDependencies[${String(at)}]`),
        ),
        files: list(item["files"] ?? [], "files").map((one_, at) =>
          text(one_, `items[${String(index)}].files[${String(at)}]`),
        ),
      };
    }),
  };
}

export const DEFAULT_PATHS: Paths = {
  ui: "src/components/ui",
  lib: "src/components/lib",
  theme: "src/components/theme",
};

export function parseConfig(value: unknown): Config {
  const entry = record(value, "components.json");
  const paths = record(entry["paths"] ?? {}, "components.json.paths");
  const theme = record(entry["theme"] ?? {}, "components.json.theme");
  const items = record(entry["items"] ?? {}, "components.json.items");

  return {
    ...(typeof entry["$schema"] === "string" ? { $schema: entry["$schema"] } : {}),
    registry: text(entry["registry"] ?? "node_modules", "components.json.registry"),
    paths: {
      ui: text(paths["ui"] ?? DEFAULT_PATHS.ui, "components.json.paths.ui"),
      lib: text(paths["lib"] ?? DEFAULT_PATHS.lib, "components.json.paths.lib"),
      theme: text(paths["theme"] ?? DEFAULT_PATHS.theme, "components.json.paths.theme"),
    },
    theme: {
      base: text(theme["base"] ?? "neutral", "components.json.theme.base"),
      ...(typeof theme["accent"] === "string" ? { accent: theme["accent"] } : {}),
      ...(typeof theme["radius"] === "string" ? { radius: theme["radius"] } : {}),
      ...(typeof theme["dark"] === "string" ? { dark: theme["dark"] } : {}),
    },
    reset: entry["reset"] !== false,
    items: Object.fromEntries(
      Object.entries(items).map(([name, files]) => [
        name,
        Object.fromEntries(
          Object.entries(record(files, `components.json.items.${name}`)).map(([path, hash]) => [
            path,
            text(hash, `components.json.items.${name}.${path}`),
          ]),
        ),
      ]),
    ),
  };
}
