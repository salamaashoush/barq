/**
 * What the project already has, read from its `package.json`.
 *
 * Only for telling a person which packages to install. Nothing here installs
 * anything: a CLI that runs someone's package manager for them is a CLI that
 * has to know about four of them, three lockfile formats and whether this is a
 * workspace — and it gets it wrong on the machine where it matters.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

/** What ran us, for the "now run" line. `npm_config_user_agent` is set by all of them. */
export function packageManager(): string {
  const agent = process.env["npm_config_user_agent"];
  const name = agent?.split(" ")[0]?.split("/")[0];
  return name === undefined || name === "" ? "npm" : name;
}

export function installCommand(packages: readonly string[]): string {
  const pm = packageManager();
  const verb = pm === "npm" ? "install" : "add";
  return `${pm} ${verb} ${packages.join(" ")}`;
}
