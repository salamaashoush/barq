/**
 * Copying a template into a directory, with nothing interactive in it.
 *
 * Split from the CLI so the gate can scaffold exactly what a person gets —
 * `bun create barq` and the test go through this one function, and a template
 * that only builds because the test set it up differently is a template that
 * does not build.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * npm REWRITES a published `.gitignore` to `.npmignore`, so a template that
 * ships one loses it on install. create-vite carries the same rename for the
 * same reason (`create-vite/src/index.ts`, `renameFiles`).
 */
const RENAMED: Readonly<Record<string, string>> = { _gitignore: ".gitignore" };

/**
 * `../templates`, from `dist/index.js` and from `src/` alike.
 *
 * Both are one directory below the package root, which is why this is a single
 * expression rather than a build-time constant.
 */
export const TEMPLATE_ROOT = fileURLToPath(new URL("../templates", import.meta.url));

export interface ScaffoldOptions {
  readonly template: string;
  readonly target: string;
  /** Goes into the generated `package.json`. */
  readonly packageName: string;
  /** Empty the target first. Refuses a non-empty directory without it. */
  readonly overwrite?: boolean;
}

export function isEmpty(path: string): boolean {
  if (!existsSync(path)) return true;
  const files = readdirSync(path);
  return files.length === 0 || (files.length === 1 && files[0] === ".git");
}

/** npm's own rule, so a name this produces is one `npm init` would accept. */
export function isValidPackageName(name: string): boolean {
  return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(name);
}

export function toValidPackageName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^[._]/, "")
    .replace(/[^a-z\d\-~]+/g, "-");
}

export function scaffold(options: ScaffoldOptions): void {
  const source = join(TEMPLATE_ROOT, options.template);
  if (!existsSync(source)) throw new Error(`no template named "${options.template}"`);

  if (options.overwrite === true && existsSync(options.target)) {
    // The directory itself survives: it may be the shell's cwd, and `.git` is
    // somebody's history rather than this scaffold's to remove.
    for (const entry of readdirSync(options.target)) {
      if (entry === ".git") continue;
      rmSync(join(options.target, entry), { recursive: true, force: true });
    }
  } else if (!isEmpty(options.target)) {
    throw new Error(`${options.target} is not empty`);
  }

  mkdirSync(options.target, { recursive: true });
  cpSync(source, options.target, { recursive: true });

  for (const [from, to] of Object.entries(RENAMED)) {
    const written = join(options.target, from);
    if (existsSync(written)) renameSync(written, join(options.target, to));
  }

  const manifestPath = join(options.target, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { name: string };
  manifest.name = options.packageName;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
