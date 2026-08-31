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

import { resolve } from "node:path";
import { stdout } from "node:process";

import { applyItems, missingDependencies, type WrittenFile } from "./add.ts";
import { CONFIG_FILE, requireConfig, SCHEMA_URL, writeConfig } from "./config.ts";
import { hashOf, read, rewrite, targetOf } from "./files.ts";
import { installCommand, installedPackages } from "./project.ts";
import { localRegistry, resolveItems, sourceFor, type Source } from "./registry.ts";
import { DEFAULT_PATHS, parseConfig, type Config, type RegistryItem } from "./schema.ts";
import { themeModule, type ThemeDefinition } from "./theme.ts";
import { unified } from "./diff.ts";
import { ask, bold, cyan, dim, green, paint, red, say, yellow } from "./tty.ts";

const HELP = `\
Usage: barq-ui <command> [options]

  init                 set up ${CONFIG_FILE}, the theme and the base styles
  add <name...>        add components, with whatever they need
  diff [name...]       what the registry has that your copy does not
  sync [name...]       take the registry's version, keeping your edits
  list                 what the registry offers
  theme <name>         change the colour theme
  build <dir>          turn a directory of components into a registry

Options:
  -c, --cwd <dir>      where the project is. Defaults to here
      --overwrite      replace a file you have edited
      --yes            take every default without asking
      --path <dir>     init: where components go
      --registry <url> init: a registry URL containing {name}
      --theme <name>   init: the base colour theme
      --accent <name>  init: an accent over it
      --radius <len>   init: --radius
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
  readonly theme?: string;
  readonly accent?: string;
  readonly radius?: string;
  readonly help: boolean;
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
  let theme: string | undefined;
  let accent: string | undefined;
  let radius: string | undefined;
  let help = false;

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
    else if (arg === "-c" || arg === "--cwd") cwd = value(++index, arg);
    else if (arg === "--path") path = value(++index, arg);
    else if (arg === "--registry") registry = value(++index, arg);
    else if (arg === "--theme") theme = value(++index, arg);
    else if (arg === "--accent") accent = value(++index, arg);
    else if (arg === "--radius") radius = value(++index, arg);
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
    theme,
    accent,
    radius,
    help,
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

function announce(root: string, items: readonly RegistryItem[], packages: readonly string[]): void {
  if (packages.length === 0) return;
  say();
  say(bold("Install what they need:"));
  say(`  ${installCommand(packages)}`);
  void root;
  void items;
}

// ---------------------------------------------------------------------------
// The theme data, which lives in the package rather than in the registry
// ---------------------------------------------------------------------------

async function themes(cwd: string): Promise<ThemeDefinition[]> {
  const directory = localRegistry(cwd);
  if (directory !== undefined) {
    // `@barqjs/ui` is installed, so its own table is the authority.
    const module_ = (await import(`${directory}/../dist/theme/index.js`)) as {
      THEMES: ThemeDefinition[];
    };
    return module_.THEMES;
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
    const bases = table.filter((theme) => theme.kind === "base");

    const path = args.path ?? (await prompt.question("Where do components go?", DEFAULT_PATHS.ui));
    const base =
      args.theme ??
      (await prompt.question(
        `Colour theme? ${dim(bases.map((t) => t.name).join(", "))}`,
        "neutral",
      ));
    const accent = args.accent;

    const root = args.cwd;
    const parent = path.replace(/\/ui$/, "");
    const config = parseConfig({
      $schema: SCHEMA_URL,
      registry: args.registry ?? "node_modules",
      paths: {
        ui: path,
        lib: path.endsWith("/ui") ? `${parent}/lib` : `${path}/lib`,
        theme: path.endsWith("/ui") ? `${parent}/theme` : `${path}/theme`,
      },
      theme: {
        base,
        ...(accent === undefined ? {} : { accent }),
        ...(args.radius === undefined ? {} : { radius: args.radius }),
      },
      reset: args.reset,
      items: {},
    });

    const source = sourceFor(config, root);
    const wanted = ["base", "layers", ...(config.reset ? ["reset"] : []), "utils"];
    const items = await resolveItems(source, wanted);
    const applied = applyItems(config, root, items);

    // The chosen theme, as source. Written last so it can name the files above.
    const themeFile = targetOf(config, root, {
      path: "theme/theme.ts",
      type: "registry:theme",
      content: "",
    });
    const module_ = themeModule(config.theme, table, {
      reset: config.reset,
      base: "./base.ts",
      resetPath: "./reset.ts",
    });
    const { write } = await import("./files.ts");
    write(themeFile, module_);

    const next: Config = {
      ...applied.config,
      items: {
        ...applied.config.items,
        theme: { "theme/theme.ts": hashOf(module_) },
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
      },
    ]);
    say();
    say(bold("Import the theme once, at your application's entry:"));
    say(`  import "./${config.paths.theme.replace(/^(\.\/)?/, "")}/theme.ts";`);

    const missing = missingDependencies(items, installedPackages(root));
    announce(root, items, missing);
    say();
    say(`Then: ${cyan("barq-ui add button card")}`);
  } finally {
    prompt.close();
  }
}

async function add(args: Args): Promise<void> {
  if (args.rest.length === 0) throw new Error("which component? `barq-ui list` shows them all");
  const { root, config } = requireConfig(args.cwd);
  const source = sourceFor(config, root);
  const items = await resolveItems(source, args.rest);

  const applied = applyItems(config, root, items, { overwrite: args.overwrite });
  writeConfig(root, applied.config);
  report(applied.files);
  announce(root, items, missingDependencies(items, installedPackages(root)));
}

/** What each item's files look like now, against what the registry has. */
async function compare(
  config: Config,
  root: string,
  source: Source,
  names: readonly string[],
): Promise<{ item: string; path: string; absolute: string; diff: string; theirs: string }[]> {
  const wanted = names.length > 0 ? names : Object.keys(config.items).filter((n) => n !== "theme");
  const items = await resolveItems(source, wanted);
  const out: { item: string; path: string; absolute: string; diff: string; theirs: string }[] = [];

  for (const item of items) {
    for (const file of item.files) {
      const absolute = targetOf(config, root, file);
      const mine = read(absolute);
      if (mine === undefined) continue;
      const theirs = rewrite(config, root, file);
      const diff = unified(mine, theirs);
      if (diff === "") continue;
      out.push({
        item: item.name,
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
  const changes = await compare(config, root, sourceFor(config, root), args.rest);

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
  const source = sourceFor(config, root);
  const changes = await compare(config, root, source, args.rest);

  if (changes.length === 0) {
    say(dim("Nothing to sync."));
    return;
  }

  const prompt = ask(!args.yes);
  const { write } = await import("./files.ts");
  const items = { ...config.items };
  let taken = 0;

  try {
    for (const change of changes) {
      const mine = read(change.absolute) ?? "";
      const recorded = items[change.item]?.[fileKey(change.path, config, root)];
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
      const key = fileKey(change.path, config, root);
      items[change.item] = { ...items[change.item], [key]: hashOf(change.theirs) };
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

/**
 * The key a file is recorded under: its path IN THE REGISTRY, not in the
 * project, so moving `paths.ui` does not lose the record.
 */
function fileKey(projectPath: string, config: Config, root: string): string {
  const name = projectPath.split("/").at(-1) ?? projectPath;
  const under = (directory: string, kind: string): string | undefined =>
    projectPath.startsWith(`${directory}/`) ? `${kind}/${name}` : undefined;
  void root;
  return (
    under(config.paths.ui, "ui") ??
    under(config.paths.lib, "lib") ??
    under(config.paths.theme, "theme") ??
    `ui/${name}`
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
  const path = targetOf(config, root, {
    path: "theme/theme.ts",
    type: "registry:theme",
    content: "",
  });
  const { write } = await import("./files.ts");
  write(path, module_);

  writeConfig(root, {
    ...config,
    theme: next,
    items: { ...config.items, theme: { "theme/theme.ts": hashOf(module_) } },
  });
  say(`${green("Theme")} ${bold(chosen.title)} written to ${path.slice(root.length + 1)}.`);
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
    case "add":
      return await add(args);
    case "diff":
      return await showDiff(args);
    case "sync":
      return await sync(args);
    case "list":
      return await list(args);
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
 * does not run one. `import.meta.main` is false for an import and true for
 * `bun src/index.ts` and for the built `bin`.
 */
export async function run(): Promise<void> {
  try {
    await main();
  } catch (error) {
    say(red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}

if (import.meta.main) await run();
