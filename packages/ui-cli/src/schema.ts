/**
 * What a registry serves and what a project records, as types and as checks.
 *
 * Hand-written rather than a schema library, for the reason the whole package
 * has no dependencies: a validator here runs once per command over a file
 * measured in kilobytes, and the error messages a hand-written one produces
 * name the field a person has to fix.
 */

/**
 * What an item, or one file of it, IS, which decides where it is written.
 *
 * `ui`, `lib`, `theme` and `hook` each have a directory of their own in
 * `components.json`. `block`, `component` and `example` keep their path under
 * the components directory, so a block made of several files lands as the
 * tree it was written as. `page` and `file` belong to the application rather
 * than to its components, so each names its own `target`.
 */
export type ItemType =
  | "registry:ui"
  | "registry:lib"
  | "registry:theme"
  | "registry:block"
  | "registry:component"
  | "registry:hook"
  | "registry:page"
  | "registry:file"
  | "registry:example";

export interface RegistryFile {
  /** Where it goes, relative to the directory its type resolves to. */
  readonly path: string;
  readonly type: ItemType;
  readonly content: string;
  /** Where it goes instead, relative to the project root. */
  readonly target?: string;
}

/** Custom properties an item adds to the project's theme, by mode. */
export interface CssVars {
  /** Declared once on `:root`, whatever the mode. */
  readonly theme?: Readonly<Record<string, string>>;
  readonly light?: Readonly<Record<string, string>>;
  readonly dark?: Readonly<Record<string, string>>;
}

/**
 * Rules an item adds to the project's theme: a selector or an at-rule, and
 * under it either declarations or more of the same.
 */
export interface CssRules {
  readonly [selector: string]: string | CssRules;
}

export interface RegistryItem {
  readonly name: string;
  readonly type: ItemType;
  readonly title: string;
  readonly description?: string;
  /** npm packages to install. */
  readonly dependencies: readonly string[];
  /** npm packages the project needs only to build or test. */
  readonly devDependencies: readonly string[];
  /**
   * Other items to add first: a bare name from the project's own registry, or
   * `@scope/name` from one of its `registries`.
   */
  readonly registryDependencies: readonly string[];
  readonly files: readonly RegistryFile[];
  readonly categories: readonly string[];
  /** Whatever the registry wants to say about the item. The CLI carries it and reads none of it. */
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly cssVars?: CssVars;
  readonly css?: CssRules;
}

export interface RegistryIndexEntry {
  readonly name: string;
  readonly type: ItemType;
  readonly title: string;
  readonly description?: string;
  readonly dependencies: readonly string[];
  readonly registryDependencies: readonly string[];
  readonly files: readonly string[];
  readonly categories: readonly string[];
}

export interface RegistryIndex {
  readonly name: string;
  readonly homepage?: string;
  readonly items: readonly RegistryIndexEntry[];
}

export interface ThemeChoice {
  /**
   * One of shadcn's eight component styles: `vega`, `nova`, `maia`, `lyra`,
   * `mira`, `luma`, `sera`, `rhea`. A style is a second opinion about how every
   * component looks, so a project picks ONE and pays for one.
   */
  readonly style?: string;
  /** A name from the registry's base themes. */
  readonly base: string;
  /** A name from its accent themes, layered over the base. */
  readonly accent?: string;
  /** `--radius`. */
  readonly radius?: string;
  /** How dark mode is asked for: a selector, or `"media"`. */
  readonly dark?: string;
  /**
   * What added items declared over the chosen theme.
   *
   * Recorded rather than only written, because `theme.ts` is regenerated when
   * the theme changes and would otherwise lose every token an item brought.
   */
  readonly cssVars?: CssVars;
  readonly css?: CssRules;
}

export interface Paths {
  readonly ui: string;
  readonly lib: string;
  readonly theme: string;
  /** Blocks, components and examples, each under the path its registry gave it. */
  readonly components: string;
  readonly hooks: string;
}

/**
 * A registry other than the project's own, reached as `@scope/name`.
 *
 * `${NAME}` in the URL or in a header is read from the environment, so a token
 * is never written into a file that is committed.
 */
export interface RegistryEndpoint {
  /** A URL, or a path from the project root, with `{name}` in it. */
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
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
  /** More registries, by the `@scope` their items are addressed with. */
  readonly registries: Readonly<Record<string, RegistryEndpoint>>;
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

const TYPES = new Set<string>([
  "registry:ui",
  "registry:lib",
  "registry:theme",
  "registry:block",
  "registry:component",
  "registry:hook",
  "registry:page",
  "registry:file",
  "registry:example",
]);

/** The two that are not components, so no directory in `paths` is theirs. */
const NEEDS_TARGET = new Set<string>(["registry:page", "registry:file"]);

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

function texts(value: unknown, where: string): string[] {
  return list(value ?? [], where).map((one, index) => text(one, `${where}[${String(index)}]`));
}

function strings(value: unknown, where: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record(value, where)).map(([key, one]) => [key, text(one, `${where}.${key}`)]),
  );
}

function cssVars(value: unknown, where: string): CssVars {
  const entry = record(value, where);
  const mode = (name: "theme" | "light" | "dark"): Partial<CssVars> =>
    entry[name] === undefined ? {} : { [name]: strings(entry[name], `${where}.${name}`) };
  return { ...mode("theme"), ...mode("light"), ...mode("dark") };
}

function cssRules(value: unknown, where: string): CssRules {
  return Object.fromEntries(
    Object.entries(record(value, where)).map(([key, one]) => [
      key,
      typeof one === "string" ? one : cssRules(one, `${where}.${key}`),
    ]),
  );
}

export function parseItem(value: unknown, where = "the item"): RegistryItem {
  const entry = record(value, where);
  const name = text(entry["name"], `${where}.name`);
  return {
    name,
    type: itemType(entry["type"], `${where}.type`),
    title: typeof entry["title"] === "string" ? entry["title"] : name,
    ...(typeof entry["description"] === "string" ? { description: entry["description"] } : {}),
    dependencies: texts(entry["dependencies"], `${where}.dependencies`),
    devDependencies: texts(entry["devDependencies"], `${where}.devDependencies`),
    registryDependencies: texts(entry["registryDependencies"], `${where}.registryDependencies`),
    files: list(entry["files"] ?? [], `${where}.files`).map((one, index) => {
      const at = `${where}.files[${String(index)}]`;
      const file = record(one, at);
      const type = itemType(file["type"], `${at}.type`);
      if (NEEDS_TARGET.has(type) && file["target"] === undefined) {
        fail(`${at}.target is required for ${type}, which has no directory of its own`);
      }
      return {
        path: text(file["path"], `${at}.path`),
        type,
        content: text(file["content"], `${at}.content`),
        ...(file["target"] === undefined ? {} : { target: text(file["target"], `${at}.target`) }),
      };
    }),
    categories: texts(entry["categories"], `${where}.categories`),
    ...(entry["meta"] === undefined ? {} : { meta: record(entry["meta"], `${where}.meta`) }),
    ...(entry["cssVars"] === undefined
      ? {}
      : { cssVars: cssVars(entry["cssVars"], `${where}.cssVars`) }),
    ...(entry["css"] === undefined ? {} : { css: cssRules(entry["css"], `${where}.css`) }),
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
        categories: texts(item["categories"], `items[${String(index)}].categories`),
      };
    }),
  };
}

export const DEFAULT_PATHS: Paths = {
  ui: "src/components/ui",
  lib: "src/components/lib",
  theme: "src/components/theme",
  components: "src/components",
  hooks: "src/hooks",
};

/**
 * Where components go when only `ui` was chosen: the directory `ui` is in.
 *
 * `init` asks one question, and a project whose `ui` is `app/widgets/ui` wants
 * its blocks in `app/widgets/blocks`, not in a `src` it does not have.
 */
function componentsBeside(ui: string): string {
  const at = ui.lastIndexOf("/");
  return ui.endsWith("/ui") && at > 0 ? ui.slice(0, at) : ui;
}

function hooksBeside(components: string): string {
  const at = components.lastIndexOf("/");
  return at > 0 ? `${components.slice(0, at)}/hooks` : "hooks";
}

function endpoint(value: unknown, where: string): RegistryEndpoint {
  const entry = typeof value === "string" ? { url: value } : record(value, where);
  const url = text(entry["url"], `${where}.url`);
  if (!url.includes("{name}")) fail(`${where} must contain {name}, which is where the item goes`);
  return { url, headers: strings(entry["headers"] ?? {}, `${where}.headers`) };
}

function registries(value: unknown): Record<string, RegistryEndpoint> {
  return Object.fromEntries(
    Object.entries(record(value, "components.json.registries")).map(([scope, one]) => {
      if (!/^@[\w-]+$/.test(scope)) {
        fail(`components.json.registries: "${scope}" must be a scope, like @acme`);
      }
      return [scope, endpoint(one, `components.json.registries.${scope}`)];
    }),
  );
}

export function parseConfig(value: unknown): Config {
  const entry = record(value, "components.json");
  const paths = record(entry["paths"] ?? {}, "components.json.paths");
  const theme = record(entry["theme"] ?? {}, "components.json.theme");
  const items = record(entry["items"] ?? {}, "components.json.items");
  const ui = text(paths["ui"] ?? DEFAULT_PATHS.ui, "components.json.paths.ui");
  const components = text(
    paths["components"] ?? componentsBeside(ui),
    "components.json.paths.components",
  );

  return {
    ...(typeof entry["$schema"] === "string" ? { $schema: entry["$schema"] } : {}),
    registry: text(entry["registry"] ?? "node_modules", "components.json.registry"),
    registries: registries(entry["registries"] ?? {}),
    paths: {
      ui,
      lib: text(paths["lib"] ?? DEFAULT_PATHS.lib, "components.json.paths.lib"),
      theme: text(paths["theme"] ?? DEFAULT_PATHS.theme, "components.json.paths.theme"),
      components,
      hooks: text(paths["hooks"] ?? hooksBeside(components), "components.json.paths.hooks"),
    },
    theme: {
      ...(typeof theme["style"] === "string" ? { style: theme["style"] } : {}),
      base: text(theme["base"] ?? "neutral", "components.json.theme.base"),
      ...(typeof theme["accent"] === "string" ? { accent: theme["accent"] } : {}),
      ...(typeof theme["radius"] === "string" ? { radius: theme["radius"] } : {}),
      ...(typeof theme["dark"] === "string" ? { dark: theme["dark"] } : {}),
      ...(theme["cssVars"] === undefined
        ? {}
        : { cssVars: cssVars(theme["cssVars"], "components.json.theme.cssVars") }),
      ...(theme["css"] === undefined
        ? {}
        : { css: cssRules(theme["css"], "components.json.theme.css") }),
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
