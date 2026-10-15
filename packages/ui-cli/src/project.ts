/**
 * What the project already has, and the package manager that gives it more.
 *
 * The manager is read from the LOCKFILE, nearest first, because that is the one
 * fact a project states about itself: a pnpm workspace invoked through `npx`
 * still wants `pnpm add`. What ran this process is the fallback, for a project
 * that has not installed anything yet.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function installedPackages(root: string): Set<string> {
  const path = join(root, "package.json");
  if (!existsSync(path)) return new Set();

  const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const out = new Set<string>();
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const entry = manifest[field];
    if (typeof entry !== "object" || entry === null) continue;
    for (const name of Object.keys(entry)) out.add(name);
  }
  return out;
}

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

const LOCKFILES: readonly (readonly [string, PackageManager])[] = [
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

/** `npm_config_user_agent` is set by all four, and names the one that ran us. */
function fromUserAgent(): PackageManager | undefined {
  const name = process.env["npm_config_user_agent"]?.split(" ")[0]?.split("/")[0];
  return name === "bun" || name === "pnpm" || name === "yarn" || name === "npm" ? name : undefined;
}

/**
 * Walks up from `root`, because a workspace keeps its one lockfile at the top
 * and the package a component is added to is somewhere under it.
 */
export function packageManager(root: string): PackageManager {
  let directory = resolve(root);
  for (;;) {
    for (const [file, name] of LOCKFILES) {
      if (existsSync(join(directory, file))) return name;
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return fromUserAgent() ?? "npm";
}

export interface InstallOptions {
  readonly dev?: boolean;
}

/** The command as its arguments, which is what runs it and what prints it. */
export function installArguments(
  manager: PackageManager,
  packages: readonly string[],
  options: InstallOptions = {},
): string[] {
  return [
    manager,
    manager === "npm" ? "install" : "add",
    ...(options.dev === true ? ["-D"] : []),
    ...packages,
  ];
}

export function installCommand(
  root: string,
  packages: readonly string[],
  options: InstallOptions = {},
): string {
  return installArguments(packageManager(root), packages, options).join(" ");
}

/**
 * Runs the install in the project, with the manager's own output on the
 * terminal: a resolution failure is that tool's to explain.
 */
export function install(
  root: string,
  packages: readonly string[],
  options: InstallOptions = {},
): void {
  const [command, ...args] = installArguments(packageManager(root), packages, options);
  const result = spawnSync(command as string, args, {
    cwd: root,
    stdio: "inherit",
    // Windows installs every one of them as a `.cmd`, which only a shell runs.
    shell: process.platform === "win32",
  });
  if (result.error !== undefined) {
    throw new Error(
      `could not run ${command as string}: ${result.error.message}\n` +
        `Run it yourself: ${[command, ...args].join(" ")}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `${[command, ...args].join(" ")} exited with ${String(result.status)}.\n` +
        "The files were written; the packages were not installed.",
    );
  }
}
