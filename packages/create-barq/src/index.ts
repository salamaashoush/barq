#!/usr/bin/env node
/**
 * `bun create barq my-app` / `npm create barq@latest my-app`.
 *
 * Asks what it was not told, then does the whole of it: the template, its
 * add-ons, the install and the first commit. Every question has a flag, and
 * `--yes` takes the defaults, so a script or an agent never meets a prompt.
 */

import { readFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { stdin, stdout } from "node:process";

import * as prompts from "@clack/prompts";

import { ADD_ONS, findAddOn } from "./addons.ts";
import { type Args, parse } from "./args.ts";
import {
  PACKAGE_MANAGERS,
  type PackageManager,
  detectPackageManager,
  generate,
  initGit,
  install,
  isPackageManager,
} from "./project.ts";
import { isEmpty, isValidPackageName, scaffold, toValidPackageName } from "./scaffold.ts";
import { DEFAULT_REF, load } from "./source.ts";
import { DEFAULT_TEMPLATE, TEMPLATES, findTemplate } from "./templates.ts";

const HELP = `\
Usage: create-barq [directory] [options]

Create a barq project.

Options:
  -t, --template NAME      ${TEMPLATES.map((t) => t.name).join(" | ")}
      --add-ons LIST       comma separated: ${ADD_ONS.map((a) => a.name).join(", ")}
      --no-add-ons         none, without being asked
      --pm NAME            ${PACKAGE_MANAGERS.join(" | ")}. Defaults to the one that ran this
      --install            install dependencies (--no-install to skip)
      --git                start a repository with one commit (--no-git to skip)
  -y, --yes                take every default without asking
      --overwrite          empty the directory first
      --ref REF            the branch, tag or commit to take templates from (${DEFAULT_REF})
      --offline            use the templates this package was published with
      --list-templates     what can be created (with --json for a tool)
      --list-add-ons       what can be added (with --json for a tool)
  -h, --help               show this

Templates:
${TEMPLATES.map((t) => `  ${t.name.padEnd(12)}${t.description}`).join("\n")}

Add-ons:
${ADD_ONS.map((a) => `  ${a.name.padEnd(12)}${a.description}`).join("\n")}
`;

interface VersionedManifest {
  version: string;
}

function ownVersion(): string {
  // `../package.json` from both `src/index.ts` and the bundled `dist/index.js`.
  const manifest = new URL("../package.json", import.meta.url);
  return (JSON.parse(readFileSync(manifest, "utf8")) as VersionedManifest).version;
}

function list(args: Args): void {
  const rows =
    args.list === "templates"
      ? TEMPLATES.map(({ name, title, description }) => ({ name, title, description }))
      : ADD_ONS.map(({ name, title, description }) => ({ name, title, description }));
  if (args.json) stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
  else for (const row of rows) stdout.write(`${row.name.padEnd(12)}${row.description}\n`);
}

/** A prompt's answer, or the end of the run when it was cancelled. */
function answered<T>(value: T): Exclude<T, symbol> {
  if (prompts.isCancel(value)) {
    prompts.cancel("Nothing was created.");
    process.exit(1);
  }
  return value as Exclude<T, symbol>;
}

interface Plan {
  readonly directory: string;
  readonly template: string;
  readonly addOns: readonly string[];
  readonly packageManager: PackageManager;
  readonly install: boolean;
  readonly git: boolean;
  readonly overwrite: boolean;
}

async function plan(args: Args): Promise<Plan> {
  // Asking needs somewhere to ask. Piped into a script, the flags are the
  // whole interface and what they leave out takes its default.
  const asks = stdin.isTTY && !args.yes;

  const directory =
    args.directory ??
    (asks
      ? answered(
          await prompts.text({
            message: "Where should the project go?",
            placeholder: "barq-project",
            defaultValue: "barq-project",
          }),
        )
      : "barq-project");
  const target = resolve(process.cwd(), directory);

  let overwrite = args.overwrite;
  if (!overwrite && !isEmpty(target)) {
    if (!asks) throw new Error(`${directory} is not empty. Pass --overwrite to empty it.`);
    overwrite = answered(
      await prompts.confirm({
        message: `${directory} is not empty. Empty it?`,
        initialValue: false,
      }),
    );
    if (!overwrite) throw new Error(`${directory} is not empty`);
  }

  const template =
    args.template ??
    (asks
      ? answered(
          await prompts.select({
            message: "Which template?",
            initialValue: DEFAULT_TEMPLATE,
            options: TEMPLATES.map((t) => ({ value: t.name, label: t.title, hint: t.description })),
          }),
        )
      : DEFAULT_TEMPLATE);
  if (findTemplate(template) === undefined) {
    throw new Error(
      `no template named "${template}". Try one of: ${TEMPLATES.map((t) => t.name).join(", ")}`,
    );
  }

  const addOns =
    args.addOns ??
    (asks
      ? answered(
          await prompts.multiselect({
            message: "Add anything? (space to pick, enter to continue)",
            required: false,
            options: ADD_ONS.map((a) => ({ value: a.name, label: a.title, hint: a.description })),
          }),
        )
      : []);
  for (const name of addOns) {
    if (findAddOn(name) === undefined) {
      throw new Error(
        `no add-on named "${name}". Try one of: ${ADD_ONS.map((a) => a.name).join(", ")}`,
      );
    }
  }

  const manager = args.packageManager ?? detectPackageManager();
  if (!isPackageManager(manager)) {
    throw new Error(`${manager} is not one of: ${PACKAGE_MANAGERS.join(", ")}`);
  }

  const installs =
    args.install ??
    (asks
      ? answered(
          await prompts.confirm({
            message: `Install dependencies with ${manager}?`,
            initialValue: true,
          }),
        )
      : true);
  const git =
    args.git ??
    (asks
      ? answered(await prompts.confirm({ message: "Start a git repository?", initialValue: true }))
      : true);

  return {
    directory,
    template,
    addOns,
    packageManager: manager,
    install: installs,
    git,
    overwrite,
  };
}

async function main(): Promise<void> {
  const args = parse(process.argv.slice(2));
  if (args.help) {
    stdout.write(HELP);
    return;
  }
  if (args.list !== undefined) {
    list(args);
    return;
  }

  prompts.intro("create-barq");
  const chosen = await plan(args);
  const target = resolve(process.cwd(), chosen.directory);

  const loaded = await load(chosen.template, { ref: args.ref, offline: args.offline });
  if (loaded.fellBack !== undefined) {
    prompts.log.warn(
      `Could not reach GitHub (${loaded.fellBack}). Using the templates this package shipped with.`,
    );
  }

  const suggested = toValidPackageName(basename(target));
  scaffold({
    template: chosen.template,
    target,
    packageName: isValidPackageName(suggested) ? suggested : "barq-project",
    overwrite: chosen.overwrite,
    files: loaded.files,
  });
  prompts.log.success(`Wrote the ${chosen.template} template to ${chosen.directory}.`);

  const todo: string[] = [];
  let installed = false;
  if (chosen.install) {
    prompts.log.step(`Installing with ${chosen.packageManager}`);
    installed = install(target, chosen.packageManager);
    if (installed) generate(target);
    else todo.push(`${chosen.packageManager} install`);
  } else todo.push(`${chosen.packageManager} install`);

  for (const name of chosen.addOns) {
    const addOn = findAddOn(name);
    if (addOn === undefined) continue;
    prompts.log.step(`Adding ${addOn.title}`);
    const left = addOn.apply({
      directory: target,
      template: chosen.template,
      packageManager: chosen.packageManager,
      installed,
      version: ownVersion(),
    });
    if (left !== undefined) todo.push(left);
  }

  if (chosen.git) {
    const made = initGit(target);
    if (made === "staged") {
      prompts.log.warn(
        "Started a repository but could not commit. Set your git identity, then commit.",
      );
    }
  }

  const run = chosen.packageManager === "npm" ? "npm run" : `${chosen.packageManager} run`;
  const steps = [`cd ${relative(process.cwd(), target) || "."}`, ...todo, `${run} dev`];
  prompts.note(steps.join("\n"), "Next");
  prompts.outro("AGENTS.md in the project tells a coding agent how to work in it.");
}

main().catch((error: unknown) => {
  prompts.log.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
