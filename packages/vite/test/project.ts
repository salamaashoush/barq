import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGES = fileURLToPath(new URL("../..", import.meta.url));
const OWN_MODULES = fileURLToPath(new URL("../node_modules", import.meta.url));

/** What an application installs, linked from the workspace. */
const LINKED = ["core", "css", "router", "server", "start", "compiler", "compiler-rs", "vite"];

const made: string[] = [];

/**
 * A project in a temporary directory, from a `create-barq` template or from
 * files given here, with the workspace packages linked into its
 * `node_modules` the way an install puts them there.
 *
 * Outside the repository, so a build writes nothing into a tracked tree.
 */
export function project(
  template: "full-stack" | "spa" | "minimal" | null,
  files: Record<string, string> = {},
): string {
  const root = mkdtempSync(join(tmpdir(), `barq-vite-${template ?? "inline"}-`));
  made.push(root);
  if (template !== null) {
    cpSync(join(PACKAGES, "create-barq", "templates", template), root, { recursive: true });
  }
  for (const [path, contents] of Object.entries(files)) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
  const modules = join(root, "node_modules");
  mkdirSync(join(modules, "@barqjs"), { recursive: true });
  for (const name of LINKED) symlinkSync(join(PACKAGES, name), join(modules, "@barqjs", name));
  symlinkSync(join(OWN_MODULES, "vite"), join(modules, "vite"));
  return root;
}

export function cleanUp(): void {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
}

/** Ports this suite may bind, so it never collides with another server on the machine. */
export const PORTS = {
  fullStack: 4693,
  spa: 4694,
  minimal: 4695,
  provider: 4697,
} as const;
