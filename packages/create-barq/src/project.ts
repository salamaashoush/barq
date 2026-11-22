/** What is done to a project once its files are written: install, add-ons, git. */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/** What ran this process. `npm_config_user_agent` is set by all of them. */
export function detectPackageManager(): PackageManager {
  const name = process.env.npm_config_user_agent?.split(" ")[0]?.split("/")[0];
  return (PACKAGE_MANAGERS as readonly string[]).includes(name ?? "")
    ? (name as PackageManager)
    : "npm";
}

export function isPackageManager(name: string): name is PackageManager {
  return (PACKAGE_MANAGERS as readonly string[]).includes(name);
}

/** The command that runs a package's binary without installing it in the project. */
export function execute(manager: PackageManager): readonly string[] {
  if (manager === "pnpm") return ["pnpm", "dlx"];
  if (manager === "yarn") return ["yarn", "dlx"];
  if (manager === "bun") return ["bunx"];
  return ["npx", "--yes"];
}

export function run(
  cwd: string,
  command: readonly string[],
  quiet = false,
): { readonly code: number; readonly output: string } {
  const [program, ...args] = command;
  const result = spawnSync(program, args, {
    cwd,
    stdio: quiet ? "pipe" : "inherit",
    // Windows installs every one of them as a `.cmd`, which only a shell runs.
    shell: process.platform === "win32",
  });
  const output = quiet ? `${String(result.stdout ?? "")}${String(result.stderr ?? "")}` : "";
  return { code: result.status ?? 1, output };
}

export function install(cwd: string, manager: PackageManager): boolean {
  return run(cwd, [manager, "install"]).code === 0;
}

/**
 * Have the Vite plugin write what it generates, the route tree above all, by
 * resolving the project's config once. A project then typechecks before its
 * first `dev` or `build`, and the first commit holds the file.
 */
export function generate(cwd: string): boolean {
  const script = 'import("vite").then((vite) => vite.resolveConfig({}, "build"))';
  return run(cwd, ["node", "-e", script], true).code === 0;
}

/**
 * A repository with one commit, so the first change a person or an agent makes
 * is a diff. Skipped inside a repository that already exists, and a commit
 * that cannot be made (no identity configured) leaves the files staged.
 */
export function initGit(cwd: string): "committed" | "staged" | "skipped" {
  if (run(cwd, ["git", "rev-parse", "--is-inside-work-tree"], true).code === 0) return "skipped";
  if (run(cwd, ["git", "init", "-q"], true).code !== 0) return "skipped";
  run(cwd, ["git", "add", "-A"], true);
  const committed = run(
    cwd,
    ["git", "commit", "-q", "-m", "chore: scaffold with create-barq"],
    true,
  );
  return committed.code === 0 ? "committed" : "staged";
}

/** Add `line` after the last import of `file`, once. */
export function addImport(cwd: string, file: string, line: string): boolean {
  const path = join(cwd, file);
  if (!existsSync(path)) return false;
  const source = readFileSync(path, "utf8");
  if (source.includes(line)) return true;
  const lines = source.split("\n");
  let last = -1;
  let open = false;
  for (const [at, text] of lines.entries()) {
    if (!open && /^import\b/.test(text)) open = true;
    // An import ends on the line that closes its specifier, however many
    // lines its names took.
    if (open && /["'];?\s*$/.test(text)) {
      last = at;
      open = false;
    }
  }
  lines.splice(last + 1, 0, line);
  writeFileSync(path, lines.join("\n"));
  return true;
}
