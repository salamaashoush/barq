/**
 * Writing a component into a project, and the import rewriting that needs.
 *
 * A registry file's own imports are relative — `../lib/slot.ts` from
 * `ui/button.tsx` — because that is what they are in the package they came
 * from. A project may put `ui` and `lib` somewhere else entirely, so every
 * relative specifier is recomputed against where the two files ACTUALLY land.
 *
 * That is the whole of it. shadcn rewrites imports to an alias
 * (`@/components/ui/button`) and needs the project's `tsconfig` paths to agree;
 * a relative path needs nothing to agree, and it is right in a project with no
 * aliases at all.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import type { Config, ItemType, RegistryFile } from "./schema.ts";

/** Where a file of this type goes, as an absolute directory. */
export function directoryFor(config: Config, cwd: string, type: ItemType): string {
  const paths = config.paths;
  const chosen =
    type === "registry:ui" ? paths.ui : type === "registry:lib" ? paths.lib : paths.theme;
  return resolve(cwd, chosen);
}

/** The absolute path a registry file is written to. */
export function targetOf(config: Config, cwd: string, file: RegistryFile): string {
  const name = file.path.split("/").at(-1) ?? file.path;
  return join(directoryFor(config, cwd, file.type), name);
}

/** `ui/button.tsx` -> `registry:ui`, so a relative import can be resolved. */
function typeOfPath(path: string): ItemType {
  const directory = path.split("/")[0];
  if (directory === "lib") return "registry:lib";
  if (directory === "theme") return "registry:theme";
  return "registry:ui";
}

const SPECIFIER = /(from\s*|import\s*)(["'])(\.[^"']*)\2/g;

/**
 * The file's own text, with every relative import pointed at where that file
 * will be.
 *
 * The extension is kept: this package's own source imports `./button.tsx`, and
 * so does what it writes. A project whose bundler wants extensionless imports
 * is the one case this does not serve, and it is the rarer one now.
 */
export function rewrite(config: Config, cwd: string, file: RegistryFile): string {
  const here = dirname(targetOf(config, cwd, file));

  return file.content.replaceAll(
    SPECIFIER,
    (whole, lead: string, quote: string, specifier: string) => {
      // Resolve against the file's position IN THE REGISTRY, which is what the
      // specifier was written against.
      const inRegistry = join(dirname(file.path), specifier).replaceAll("\\", "/");
      const name = inRegistry.split("/").at(-1);
      if (name === undefined) return whole;

      const there = join(directoryFor(config, cwd, typeOfPath(inRegistry)), name);
      let next = relative(here, there).replaceAll("\\", "/");
      if (!next.startsWith(".")) next = `./${next}`;
      return `${lead}${quote}${next}${quote}`;
    },
  );
}

export function hashOf(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export function read(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}
