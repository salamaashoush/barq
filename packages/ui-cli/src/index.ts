#!/usr/bin/env node
/**
 * `barq-ui` — copy `@barqjs/ui` components into a project, and keep them in
 * sync with the registry they came from.
 *
 * NO DEPENDENCIES. The argument parsing, the prompts, the diff and the schema
 * checks are each smaller than the library that would do them, and a tool
 * someone runs once to write eight files should not download eight of its own
 * first. `create-barq` in this repository makes the same trade for the same
 * reason.
 *
 * ## What `sync` is, and why it is not `add` again
 *
 * shadcn's `diff` shows what upstream changed and leaves the applying to you,
 * because it cannot tell an edited file from an untouched one. `init` and `add`
 * here record a hash per file, so `sync` can: an untouched file is replaced
 * without asking, an edited one is shown as a diff and kept unless you say
 * otherwise. Owning the code means the edit wins by default.
 */

import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { stdout } from "node:process";
import { fileURLToPath } from "node:url";

import { applyItems, missingDependencies, type WrittenFile } from "./add.ts";
import { CONFIG_FILE, findRoot, requireConfig, writeConfig } from "./config.ts";
import { hashOf, placed, read, rewrite, targetOf, write } from "./files.ts";
import { install, installCommand, installedPackages, packageManager } from "./project.ts";
import {
  localRegistry,
  localStyles,
  registriesFor,
  resolveItems,
  sourceFor,
  type Registries,
} from "./registry.ts";
import {
  DEFAULT_PATHS,
  parseConfig,
  type Config,
  type RegistryIndexEntry,
  type RegistryItem,
} from "./schema.ts";
import { resolveTheme, themeModule, withItemCss, type ThemeDefinition } from "./theme.ts";
import { unified } from "./diff.ts";
import { ask, bold, cyan, dim, green, paint, red, say, yellow, type Option } from "./tty.ts";

const HELP = `\
Usage: barq-ui <command> [options]

  init                 set up ${CONFIG_FILE}, the theme and the base styles
  add <name...>        add components and blocks, with whatever they need
  diff [name...]       what the registry has that your copy does not
  sync [name...]       take the registry's version, keeping your edits
  list                 what the registry offers
  search <query>       find items by name, description or category
  view <name...>       print items as the registry serves them
  info                 what this project is set up with
  theme <name>         change the colour theme
  style <name>         change the component style
  build <dir>          turn a directory of components into a registry

A name is an item in the project's registry, or @scope/name for one of the
registries ${CONFIG_FILE} lists.

Options:
  -c, --cwd <dir>      where the project is. Defaults to here
      --overwrite      replace a file you have edited
      --yes            take every default without asking
      --no-install     print the install command instead of running it
      --all            add: every ui component the registry has
      --dry-run        add: say what would be written, and write nothing
      --diff[=<file>]  add: show what would change, and write nothing
      --view[=<file>]  add: show what would be written, and write nothing
      --json           search, info: print JSON
      --path <dir>     init: where components go
      --registry <url> init: a registry URL containing {name}
      --style <name>   init: the component style (vega, nova, lyra, …)
      --theme <name>   init: the base colour theme
      --accent <name>  init: an accent over it
      --radius <len>   init: --radius
      --dark <sel>     init: the dark-mode selector, or "media"
      --no-reset       init: do not install the CSS reset
  -h, --help           show this
`;

interface Args {
  readonly command?: string;
  readonly rest: string[];
  readonly cwd: string;
  readonly overwrite: boolean;
  readonly yes: boolean;
  readonly reset: boolean;
  readonly path?: string;
  readonly registry?: string;
  readonly style?: string;
  readonly theme?: string;
  readonly accent?: string;
  readonly radius?: string;
  readonly dark?: string;
  readonly help: boolean;
  readonly install: boolean;
  readonly all: boolean;
  readonly dryRun: boolean;
  /** `true` is every file; a string is the files whose path ends with it. */
  readonly diff?: string | true;
  readonly view?: string | true;
  readonly json: boolean;
}

function parse(argv: readonly string[]): Args {
  const rest: string[] = [];
  let command: string | undefined;
  let cwd = process.cwd();
  let overwrite = false;
  let yes = false;
  let reset = true;
  let path: string | undefined;
  let registry: string | undefined;
  let style: string | undefined;
  let theme: string | undefined;
  let accent: string | undefined;
  let radius: string | undefined;
  let dark: string | undefined;
  let help = false;
  let install_ = true;
  let all = false;
  let dryRun = false;
  let diff: string | true | undefined;
  let viewing: string | true | undefined;
  let json = false;

  const value = (index: number, flag: string): string => {
    const next = argv[index];
    if (next === undefined) throw new Error(`${flag} needs a value`);
    return next;
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] ?? "";
    if (arg === "-h" || arg === "--help") help = true;
    else if (arg === "--overwrite") overwrite = true;
    else if (arg === "-y" || arg === "--yes") yes = true;
    else if (arg === "--no-reset") reset = false;
    else if (arg === "--no-install") install_ = false;
    else if (arg === "-a" || arg === "--all") all = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--json") json = true;
    else if (arg === "--diff") diff = true;
    else if (arg === "--view") viewing = true;
    // Only with `=`. A bare `--diff button` cannot say whether `button` is the
    // file to show or the component to add.
    else if (arg.startsWith("--diff=")) diff = arg.slice("--diff=".length);
    else if (arg.startsWith("--view=")) viewing = arg.slice("--view=".length);
    else if (arg === "-c" || arg === "--cwd") cwd = value(++index, arg);
    else if (arg === "--path") path = value(++index, arg);
    else if (arg === "--registry") registry = value(++index, arg);
    else if (arg === "--style") style = value(++index, arg);
    else if (arg === "--theme") theme = value(++index, arg);
    else if (arg === "--accent") accent = value(++index, arg);
    else if (arg === "--radius") radius = value(++index, arg);
    else if (arg === "--dark") dark = value(++index, arg);
    else if (arg.startsWith("--")) {
      const split = arg.indexOf("=");
      if (split < 0) throw new Error(`unknown option ${arg}`);
      // `--theme=blue` as well as `--theme blue`, because both are written.
      argv = [
        ...argv.slice(0, index),
        arg.slice(0, split),
        arg.slice(split + 1),
        ...argv.slice(index + 1),
      ];
      index--;
    } else if (command === undefined) command = arg;
    else rest.push(arg);
  }

  return {
    command,
    rest,
    cwd: resolve(cwd),
    overwrite,
    yes,
    reset,
    path,
    registry,
    style,
    theme,
    accent,
    radius,
    dark,
    help,
    install: install_,
    all,
    dryRun,
    diff,
    view: viewing,
    json,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const MARK: Record<WrittenFile["outcome"], string> = {
  written: green("+"),
  replaced: cyan("~"),
  unchanged: dim("="),
  kept: yellow("!"),
};

function report(files: readonly WrittenFile[]): void {
  const interesting = files.filter((file) => file.outcome !== "unchanged");
  if (interesting.length === 0) {
    say(dim("Everything was already up to date."));
    return;
  }
  for (const file of interesting) say(`  ${MARK[file.outcome]} ${file.path}`);

  const kept = files.filter((file) => file.outcome === "kept");
  if (kept.length > 0) {
    say();
    say(
      yellow(
        `${String(kept.length)} file${kept.length === 1 ? "" : "s"} you have edited ` +
          `${kept.length === 1 ? "was" : "were"} left alone.`,
      ),
    );
    say(dim("`barq-ui diff` shows what the registry has; `--overwrite` takes it."));
  }
}

/**
 * The packages the items import that the project does not have: installed, or
 * with `--no-install` named so a person can.
 */
function settle(root: string, items: readonly RegistryItem[], installing: boolean): void {
  const installed = installedPackages(root);
  const runtime = missingDependencies(items, installed);
  const development = missingDependencies(items, installed, "devDependencies");
  if (runtime.length === 0 && development.length === 0) return;

  say();
  if (!installing) {
    say(bold("Install what they need:"));
    if (runtime.length > 0) say(`  ${installCommand(root, runtime)}`);
    if (development.length > 0) say(`  ${installCommand(root, development, { dev: true })}`);
    return;
  }
  say(bold("Installing what they need:"));
  if (runtime.length > 0) install(root, runtime);
  if (development.length > 0) install(root, development, { dev: true });
}

// ---------------------------------------------------------------------------
// The theme data, which lives in the package rather than in the registry
// ---------------------------------------------------------------------------

/**
 * What a list answers with when the answer is "leave it alone".
 *
 * A prompt has to return a string, and the config's `accent` and `radius` are
 * both absent rather than empty when they are not chosen — an empty `--radius`
 * would write `--radius: ;`.
 */
const NONE = "";

const NO_ACCENT: Option = { value: NONE, label: dim("None, the base's own colours") };

/** shadcn's own four, plus leaving whatever the base declares. */
const RADII: readonly Option[] = [
  { value: NONE, label: dim("The theme's own") },
  { value: "0", label: "None" },
  { value: "0.45rem", label: "Small" },
  { value: "0.625rem", label: "Medium" },
  { value: "0.875rem", label: "Large" },
];

function blank(answer: string): string | undefined {
  return answer === NONE ? undefined : answer;
}

/**
 * The styles the installed package actually ships, read rather than listed.
 *
 * A style added upstream appears here without this file changing, and one that
 * is missing from the install says so instead of writing a broken import.
 */
function styles(cwd: string): Option[] {
  const directory = localStyles(cwd);
  if (directory === undefined) return [];
  return readdirSync(directory)
    .filter((file) => file.endsWith(".css"))
    .map((file) => file.replace(/\.css$/, ""))
    .toSorted()
    .map((name) => ({ value: name, label: name[0]?.toUpperCase() + name.slice(1) }));
}

/**
 * The chosen style, copied into the project beside the theme.
 *
 * COPIED rather than imported from `node_modules`, for the reason the whole
 * tool exists: what it writes is yours, and a style is 180 KB of ordinary CSS
 * you may want to edit. A project pays for the one it picked.
 */
function writeStyle(root: string, config: Config, name: string, cwd: string): string {
  const directory = localStyles(cwd);
  if (directory === undefined) {
    throw new Error(
      "the component styles come from @barqjs/ui, and this install has none.\n" +
        "Reinstall it, or leave `--style` off.",
    );
  }
  const from = join(directory, `${name}.css`);
  if (!existsSync(from)) {
    throw new Error(
      `no style named "${name}". Try one of: ${styles(cwd)
        .map((each) => each.value)
        .join(", ")}`,
    );
  }
  const target = targetOf(config, root, {
    path: "theme/style.css",
    type: "registry:theme",
    content: "",
  });
  writeFileSync(target, readFileSync(from, "utf8"));
  return target;
}

async function themes(cwd: string): Promise<ThemeDefinition[]> {
  const directory = localRegistry(cwd);
  if (directory !== undefined) {
    // `@barqjs/ui` is installed, so its own table is the authority.
    //
    // Read as DATA, not imported as a module. That package publishes source
    // rather than a build — a compiled component is specific to one backend and
    // one `hydratable`, so there is nothing here to `import()` — and a table of
    // colours never needed compiling anyway.
    const file = join(directory, "themes.json");
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, "utf8")) as ThemeDefinition[];
    }
    throw new Error(
      `the colour themes come from @barqjs/ui, and ${file} is missing.\n` +
        "Reinstall it, or write the theme file by hand.",
    );
  }
  throw new Error(
    "the colour themes come from @barqjs/ui, which is not installed here.\n" +
      "Install it, or write the theme file by hand.",
  );
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function init(args: Args): Promise<void> {
  const prompt = ask(!args.yes);
  try {
    const table = await themes(args.cwd);
    const options = (kind: ThemeDefinition["kind"]): Option[] =>
      table
        .filter((theme) => theme.kind === kind)
        .map((theme) => ({ value: theme.name, label: theme.title }));

    const path = args.path ?? (await prompt.question("Where do components go?", DEFAULT_PATHS.ui));
    // NONE first, and it is the default. This package's own look is shadcn's
    // classic registry, transcribed; a style is one of eight SECOND opinions
    // over it, 180 KB each. Defaulting to one would install a file nobody asked
    // for and quietly replace the look the rest of the tool promises.
    const available = styles(args.cwd);
    const style =
      args.style ??
      (available.length === 0
        ? undefined
        : blank(
            await prompt.choose(
              "Component style?",
              [{ value: NONE, label: dim("None, the components' own look") }, ...available],
              NONE,
            ),
          ));
    const base = args.theme ?? (await prompt.choose("Colour theme?", options("base"), "neutral"));
    const accent =
      args.accent ??
      blank(await prompt.choose("An accent over it?", [NO_ACCENT, ...options("accent")], NONE));
    const radius = args.radius ?? blank(await prompt.choose("Corner radius?", RADII, NONE));
    const reset = args.reset && (await prompt.confirm("Install the CSS reset?", true));

    const root = args.cwd;
    const parent = path.replace(/\/ui$/, "");
    const config = parseConfig({
      registry: args.registry ?? "node_modules",
      paths: {
        ui: path,
        lib: path.endsWith("/ui") ? `${parent}/lib` : `${path}/lib`,
        theme: path.endsWith("/ui") ? `${parent}/theme` : `${path}/theme`,
      },
      theme: {
        ...(style === undefined ? {} : { style }),
        base,
        ...(accent === undefined ? {} : { accent }),
        ...(radius === undefined ? {} : { radius }),
        ...(args.dark === undefined ? {} : { dark: args.dark }),
      },
      reset,
      items: {},
    });

    // Before a single file is written. `init` writes the base styles first and
    // reaches the theme last, so a mistyped `--theme` used to leave four files
    // on disk and no `components.json` beside them.
    resolveTheme(config.theme, table);
    if (style !== undefined && !available.some((each) => each.value === style)) {
      throw new Error(
        `no style named "${style}". Try one of: ${available.map((each) => each.value).join(", ")}`,
      );
    }

    const wanted = ["base", "layers", ...(config.reset ? ["reset"] : []), "utils"];
    const items = await resolveItems(registriesFor(config, root), wanted);
    const applied = applyItems(config, root, items);

    // The chosen theme, as source. Written last so it can name the files above.
    const themeFile = themeTarget(config, root);
    const module_ = themeModule(config.theme, table, {
      reset: config.reset,
      base: "./base.ts",
      resetPath: "./reset.ts",
    });
    write(themeFile, module_);
    const styleFile = style === undefined ? undefined : writeStyle(root, config, style, args.cwd);

    const next: Config = {
      ...applied.config,
      items: {
        ...applied.config.items,
        theme: { [THEME_KEY]: hashOf(module_) },
      },
    };
    writeConfig(root, next);

    say(`${green("Set up")} ${bold(CONFIG_FILE)} and the theme.`);
    report([
      ...applied.files,
      {
        item: "theme",
        path: themeFile.slice(root.length + 1),
        absolute: themeFile,
        outcome: "written",
        hash: hashOf(module_),
        incoming: module_,
      },
    ]);
    say();
    say(bold("Import the theme once, at your application's entry:"));
    say(`  import "./${config.paths.theme.replace(/^(\.\/)?/, "")}/theme.ts";`);
    if (styleFile !== undefined && style !== undefined) {
      say();
      say(bold("And the style, with its class on the element it applies to:"));
      say(`  import "./${config.paths.theme.replace(/^(\.\/)?/, "")}/style.css";`);
      say(`  <html class="style-${style}">`);
    }

    settle(root, items, args.install);
    say();
    say(`Then: ${cyan("barq-ui add button card")}`);
  } finally {
    prompt.close();
  }
}

const THEME_KEY = "theme/theme.ts";

function themeTarget(config: Config, root: string): string {
  return targetOf(config, root, { path: THEME_KEY, type: "registry:theme", content: "" });
}

/**
 * What the items' `cssVars` and `css` make of the theme, written the way a
 * component is: replaced when the project has not touched `theme.ts`, kept when
 * it has.
 *
 * The choice is recorded either way. A kept file is the project's to merge,
 * and the next `barq-ui theme` writes the tokens with the colours it picks.
 */
async function extendTheme(
  config: Config,
  root: string,
  items: readonly RegistryItem[],
  options: { overwrite: boolean; dryRun: boolean },
): Promise<{ config: Config; file?: WrittenFile }> {
  if (!items.some((item) => item.cssVars !== undefined || item.css !== undefined)) {
    return { config };
  }
  const theme = items.reduce(withItemCss, config.theme);

  const incoming = themeModule(theme, await themes(root), {
    reset: config.reset,
    base: "./base.ts",
    resetPath: "./reset.ts",
  });
  const absolute = themeTarget(config, root);
  const existing = read(absolute);
  const common = { item: "theme", path: absolute.slice(root.length + 1), absolute, incoming };
  const recorded = config.items["theme"]?.[THEME_KEY];

  if (existing !== undefined && existing !== incoming) {
    if (!options.overwrite && hashOf(existing) !== recorded) {
      return {
        config: { ...config, theme },
        file: { ...common, outcome: "kept", hash: hashOf(existing), existing },
      };
    }
  }
  if (!options.dryRun && existing !== incoming) write(absolute, incoming);
  return {
    config: {
      ...config,
      theme,
      items: { ...config.items, theme: { [THEME_KEY]: hashOf(incoming) } },
    },
    file: {
      ...common,
      outcome:
        existing === undefined ? "written" : existing === incoming ? "unchanged" : "replaced",
      hash: hashOf(incoming),
      ...(existing === undefined ? {} : { existing }),
    },
  };
}

/** The files a `--diff=` or `--view=` asked about: all of them, or the ones named. */
function asked(files: readonly WrittenFile[], which: string | true): WrittenFile[] {
  return which === true ? [...files] : files.filter((file) => file.path.endsWith(which));
}

/**
 * What `add` would do, shown rather than done.
 *
 * `--diff` and `--view` are the same preview read two ways: what would change
 * in a file the project has, and what a file would be.
 */
function preview(
  root: string,
  args: Args,
  items: readonly RegistryItem[],
  files: readonly WrittenFile[],
): void {
  if (args.view !== undefined) {
    for (const file of asked(files, args.view)) {
      say();
      say(bold(file.path));
      say(file.incoming);
    }
    return;
  }

  if (args.diff !== undefined) {
    const changed = asked(files, args.diff).filter((file) => file.outcome !== "unchanged");
    if (changed.length === 0) {
      say(dim("Nothing would change."));
      return;
    }
    for (const file of changed) {
      say();
      say(`${bold(file.path)}${file.existing === undefined ? dim(" (new)") : ""}`);
      say(
        paint(
          file.existing === undefined
            ? file.incoming
                .split("\n")
                .map((line) => `+ ${line}`)
                .join("\n")
            : unified(file.existing, file.incoming),
        ),
      );
    }
    return;
  }

  say(bold("Dry run. Nothing was written."));
  report(files);
  const installed = installedPackages(root);
  const runtime = missingDependencies(items, installed);
  const development = missingDependencies(items, installed, "devDependencies");
  if (runtime.length > 0 || development.length > 0) {
    say();
    say(bold("Would install:"));
    if (runtime.length > 0) say(`  ${installCommand(root, runtime)}`);
    if (development.length > 0) say(`  ${installCommand(root, development, { dev: true })}`);
  }
}

async function add(args: Args): Promise<void> {
  const { root, config } = requireConfig(args.cwd);
  const names = args.all
    ? (await sourceFor(config, root).index()).items
        .filter((item) => item.type === "registry:ui")
        .map((item) => item.name)
    : args.rest;
  if (names.length === 0) throw new Error("which component? `barq-ui list` shows them all");

  const items = await resolveItems(registriesFor(config, root), names);
  const dryRun = args.dryRun || args.diff !== undefined || args.view !== undefined;

  const applied = applyItems(config, root, items, { overwrite: args.overwrite, dryRun });
  const themed = await extendTheme(applied.config, root, items, {
    overwrite: args.overwrite,
    dryRun,
  });
  const files = [...applied.files, ...(themed.file === undefined ? [] : [themed.file])];

  if (dryRun) {
    preview(root, args, items, files);
    return;
  }
  writeConfig(root, themed.config);
  report(files);
  settle(root, items, args.install);
}

interface Difference {
  readonly item: string;
  /** The file's path in the registry, which is what its hash is recorded under. */
  readonly key: string;
  readonly path: string;
  readonly absolute: string;
  readonly diff: string;
  readonly theirs: string;
}

/** What each item's files look like now, against what the registry has. */
async function compare(
  config: Config,
  root: string,
  registries: Registries,
  names: readonly string[],
): Promise<Difference[]> {
  const wanted = names.length > 0 ? names : Object.keys(config.items).filter((n) => n !== "theme");
  const items = await resolveItems(registries, wanted);
  const together = placed(items);
  const out: Difference[] = [];

  for (const item of items) {
    for (const file of item.files) {
      const absolute = targetOf(config, root, file);
      const mine = read(absolute);
      if (mine === undefined) continue;
      const theirs = rewrite(config, root, file, together);
      const diff = unified(mine, theirs);
      if (diff === "") continue;
      out.push({
        item: item.name,
        key: file.path,
        path: absolute.slice(root.length + 1),
        absolute,
        diff,
        theirs,
      });
    }
  }
  return out;
}

async function showDiff(args: Args): Promise<void> {
  const { root, config } = requireConfig(args.cwd);
  const changes = await compare(config, root, registriesFor(config, root), args.rest);

  if (changes.length === 0) {
    say(dim("Nothing has changed."));
    return;
  }
  for (const change of changes) {
    say();
    say(bold(change.path));
    say(paint(change.diff));
  }
  say();
  say(dim(`${String(changes.length)} file(s). \`barq-ui sync\` takes the registry's version.`));
}

async function sync(args: Args): Promise<void> {
  const { root, config } = requireConfig(args.cwd);
  const changes = await compare(config, root, registriesFor(config, root), args.rest);

  if (changes.length === 0) {
    say(dim("Nothing to sync."));
    return;
  }

  const prompt = ask(!args.yes);
  const items = { ...config.items };
  let taken = 0;

  try {
    for (const change of changes) {
      const mine = read(change.absolute) ?? "";
      const recorded = items[change.item]?.[change.key];
      const untouched = recorded !== undefined && hashOf(mine) === recorded;

      if (!untouched && !args.overwrite) {
        say();
        say(`${bold(change.path)} ${yellow("(you have edited this)")}`);
        say(paint(change.diff));
        const take = await prompt.confirm("Take the registry's version?", false);
        if (!take) continue;
      }

      write(change.absolute, change.theirs);
      taken++;
      items[change.item] = { ...items[change.item], [change.key]: hashOf(change.theirs) };
    }
  } finally {
    prompt.close();
  }

  writeConfig(root, { ...config, items });
  say();
  say(
    taken === 0
      ? dim("Nothing was replaced.")
      : `${green("Synced")} ${String(taken)} file${taken === 1 ? "" : "s"}.`,
  );
}

async function list(args: Args): Promise<void> {
  const root = requireConfigOrCwd(args.cwd);
  const config = root.config;
  const index = await sourceFor(config, root.root).index();

  const groups = new Map<string, typeof index.items>();
  for (const item of index.items) {
    groups.set(item.type, [...(groups.get(item.type) ?? []), item]);
  }

  for (const [type, items] of [...groups].toSorted(([a], [b]) => a.localeCompare(b))) {
    say();
    say(bold(type.replace("registry:", "")));
    for (const item of items) {
      const have = config.items[item.name] !== undefined ? green(" (added)") : "";
      say(`  ${item.name.padEnd(18)}${dim(item.description?.slice(0, 60) ?? "")}${have}`);
    }
  }
}

/** `list` works before `init`, against the installed package's registry. */
function requireConfigOrCwd(cwd: string): { root: string; config: Config } {
  try {
    return requireConfig(cwd);
  } catch {
    return {
      root: cwd,
      config: parseConfig({ registry: "node_modules", paths: DEFAULT_PATHS, items: {} }),
    };
  }
}

/** `view` works before `init` too: reading an item needs a registry, not a project. */
async function view(args: Args): Promise<void> {
  if (args.rest.length === 0) throw new Error("which item? `barq-ui list` shows them all");
  const { root, config } = requireConfigOrCwd(args.cwd);
  const registries = registriesFor(config, root);

  const items: RegistryItem[] = [];
  for (const address of args.rest) {
    const { source, name } = registries.locate(address);
    items.push({ ...(await source.item(name)), name: address });
  }
  say(JSON.stringify(items, null, 2));
}

interface Found {
  /** What `add` takes: the name, with its scope when it has one. */
  readonly name: string;
  readonly type: string;
  readonly title: string;
  readonly description?: string;
  readonly categories: readonly string[];
  readonly registry: string;
}

/** Every word of the query, somewhere in what the entry says about itself. */
function matches(entry: RegistryIndexEntry, words: readonly string[]): boolean {
  const haystack = [entry.name, entry.title, entry.description ?? "", ...entry.categories]
    .join(" ")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

async function search(args: Args): Promise<void> {
  const words = args.rest.map((word) => word.toLowerCase());
  if (words.length === 0) throw new Error("search for what? `barq-ui search sidebar`");
  const { root, config } = requireConfigOrCwd(args.cwd);
  const registries = registriesFor(config, root);

  const found: Found[] = [];
  const unreachable: string[] = [];
  for (const scope of [undefined, ...registries.scopes]) {
    try {
      const source = registries.source(scope);
      for (const entry of (await source.index()).items) {
        if (!matches(entry, words)) continue;
        found.push({
          name: scope === undefined ? entry.name : `${scope}/${entry.name}`,
          type: entry.type,
          title: entry.title,
          ...(entry.description === undefined ? {} : { description: entry.description }),
          categories: entry.categories,
          registry: source.describe,
        });
      }
    } catch (error) {
      // One registry that is down should not hide what the others have.
      unreachable.push(
        `${scope ?? "the registry"}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (args.json) {
    say(JSON.stringify({ items: found, errors: unreachable }, null, 2));
    return;
  }
  for (const line of unreachable) say(yellow(line));
  if (found.length === 0) {
    say(dim(`Nothing matches "${args.rest.join(" ")}".`));
    return;
  }
  const width = Math.max(...found.map((item) => item.name.length)) + 2;
  for (const item of found) {
    say(
      `  ${item.name.padEnd(width)}${dim(item.type.replace("registry:", "").padEnd(11))}${dim(item.description?.slice(0, 60) ?? "")}`,
    );
  }
  say();
  say(
    dim(
      `${String(found.length)} item${found.length === 1 ? "" : "s"}. \`barq-ui add <name>\` takes one.`,
    ),
  );
}

async function info(args: Args): Promise<void> {
  const root = findRoot(args.cwd);
  const { config } = requireConfigOrCwd(args.cwd);
  const project = root ?? args.cwd;
  const added = Object.keys(config.items)
    .filter((name) => name !== "theme")
    .toSorted();
  const facts = {
    root: project,
    config: root === undefined ? null : join(root, CONFIG_FILE),
    registry: config.registry,
    registries: Object.fromEntries(
      Object.entries(config.registries).map(([scope, endpoint]) => [scope, endpoint.url]),
    ),
    paths: config.paths,
    theme: config.theme,
    packageManager: packageManager(project),
    packages: [...installedPackages(project)]
      .filter((name) => name.startsWith("@barqjs/"))
      .toSorted(),
    items: added,
  };

  if (args.json) {
    say(JSON.stringify(facts, null, 2));
    return;
  }

  const row = (label: string, value: string): void => say(`  ${label.padEnd(17)}${value}`);
  say(bold("Project"));
  row("root", facts.root);
  row("config", facts.config ?? dim(`none. \`barq-ui init\` writes ${CONFIG_FILE}`));
  row("package manager", facts.packageManager);
  row("barq packages", facts.packages.length === 0 ? dim("none") : facts.packages.join(", "));
  say();
  say(bold("Registries"));
  row("(default)", facts.registry);
  for (const [scope, url] of Object.entries(facts.registries)) row(scope, url);
  say();
  say(bold("Paths"));
  for (const kind of ["ui", "lib", "theme", "components", "hooks"] as const) {
    row(kind, config.paths[kind]);
  }
  say();
  say(bold("Theme"));
  row("base", config.theme.base);
  if (config.theme.accent !== undefined) row("accent", config.theme.accent);
  if (config.theme.style !== undefined) row("style", config.theme.style);
  if (config.theme.radius !== undefined) row("radius", config.theme.radius);
  say();
  say(bold(`Added (${String(added.length)})`));
  say(added.length === 0 ? dim("  nothing yet") : `  ${added.join(", ")}`);
  await Promise.resolve();
}

async function chooseTheme(args: Args): Promise<void> {
  const name = args.rest[0];
  if (name === undefined) throw new Error("which theme? `barq-ui list` shows the components");
  const { root, config } = requireConfig(args.cwd);
  const table = await themes(root);

  const chosen = table.find((entry) => entry.name === name);
  if (chosen === undefined) {
    throw new Error(
      `no theme named "${name}". Try one of: ${table.map((entry) => entry.name).join(", ")}`,
    );
  }

  const next = {
    ...config.theme,
    ...(chosen.kind === "base" ? { base: name } : { accent: name }),
    ...(args.radius === undefined ? {} : { radius: args.radius }),
  };
  const module_ = themeModule(next, table, {
    reset: config.reset,
    base: "./base.ts",
    resetPath: "./reset.ts",
  });
  const path = themeTarget(config, root);
  write(path, module_);

  writeConfig(root, {
    ...config,
    theme: next,
    items: { ...config.items, theme: { [THEME_KEY]: hashOf(module_) } },
  });
  say(`${green("Theme")} ${bold(chosen.title)} written to ${path.slice(root.length + 1)}.`);
}

/** `barq-ui style nova`, the shape `barq-ui theme` already has. */
async function chooseStyle(args: Args): Promise<void> {
  const name = args.rest[0] ?? args.style;
  const { root, config } = requireConfig(args.cwd);
  const available = styles(args.cwd);
  if (available.length === 0) {
    throw new Error("the component styles come from @barqjs/ui, and this install has none.");
  }
  if (name === undefined) {
    throw new Error(`which style? ${available.map((each) => each.value).join(", ")}`);
  }
  if (!available.some((each) => each.value === name)) {
    throw new Error(
      `no style named "${name}". Try one of: ${available.map((each) => each.value).join(", ")}`,
    );
  }

  const path = writeStyle(root, config, name, args.cwd);
  writeConfig(root, { ...config, theme: { ...config.theme, style: name } });
  say(`${green("Style")} ${bold(name)} written to ${path.slice(root.length + 1)}.`);
  say(dim(`Put class="style-${name}" on the element it applies to.`));
  await Promise.resolve();
}

async function build(args: Args): Promise<void> {
  const directory = args.rest[0];
  if (directory === undefined) throw new Error("which directory? `barq-ui build ./src/ui`");
  const { buildRegistry } = await import("./build.ts");
  const written = buildRegistry(resolve(args.cwd, directory), resolve(args.cwd, "registry"));
  say(`${green("Built")} ${String(written)} items into registry/`);
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parse(process.argv.slice(2));
  if (args.help || args.command === undefined) {
    stdout.write(HELP);
    return;
  }

  switch (args.command) {
    case "init":
      return await init(args);
    case "style":
      return await chooseStyle(args);
    case "add":
      return await add(args);
    case "diff":
      return await showDiff(args);
    case "sync":
      return await sync(args);
    case "list":
      return await list(args);
    case "search":
      return await search(args);
    case "view":
      return await view(args);
    case "info":
      return await info(args);
    case "theme":
      return await chooseTheme(args);
    case "build":
      return await build(args);
    default:
      throw new Error(`unknown command "${args.command}". Try \`barq-ui --help\``);
  }
}

/**
 * Exported so the suite can drive the commands, and guarded so importing it
 * does not run one. The guard compares the script node was asked to run with
 * this module rather than reading `import.meta.main`, which node only defines
 * from 24.2 and so is `undefined` for the built `bin` on every older node the
 * engines range admits. `argv[1]` is the `.bin` symlink under a package
 * manager, hence the realpath.
 */
export async function run(): Promise<void> {
  try {
    await main();
  } catch (error) {
    say(red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}

function invokedDirectly(): boolean {
  const script = process.argv[1];
  return script !== undefined && realpathSync(script) === fileURLToPath(import.meta.url);
}

if (invokedDirectly()) await run();
