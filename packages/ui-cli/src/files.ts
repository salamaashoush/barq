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
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import type { Config, ItemType, RegistryFile } from "./schema.ts";

/**
 * Where a file of this type goes, as an absolute directory.
 *
 * `page` and `file` have none of their own and answer with the project root,
 * which is what their `target` is relative to.
 */
export function directoryFor(config: Config, cwd: string, type: ItemType): string {
  const paths = config.paths;
  const chosen: Record<ItemType, string> = {
    "registry:ui": paths.ui,
    "registry:lib": paths.lib,
    "registry:theme": paths.theme,
    "registry:hook": paths.hooks,
    "registry:block": paths.components,
    "registry:component": paths.components,
    "registry:example": paths.components,
    "registry:page": ".",
    "registry:file": ".",
  };
  return resolve(cwd, chosen[type]);
}

/** The three whose registry path is a tree to keep rather than a name to file. */
const NESTED = new Set<ItemType>(["registry:block", "registry:component", "registry:example"]);

/**
 * The absolute path a registry file is written to.
 *
 * A registry is someone else's data, and a `target` or a path that climbs out
 * of the project would let `add` write anywhere the user can. So the answer is
 * checked against the root before anything is written to it.
 */
export function targetOf(config: Config, cwd: string, file: RegistryFile): string {
  const root = resolve(cwd);
  const name = file.path.split("/").at(-1) ?? file.path;
  const absolute =
    file.target !== undefined
      ? resolve(root, file.target.replace(/^~\//, ""))
      : NESTED.has(file.type)
        ? join(directoryFor(config, cwd, file.type), file.path.replace(/^components\//, ""))
        : join(directoryFor(config, cwd, file.type), name);

  const inside = relative(root, absolute);
  if (inside.startsWith("..") || isAbsolute(inside)) {
    throw new Error(`${file.path} would be written to ${absolute}, which is outside the project`);
  }
  return absolute;
}

/** The directory a registry path starts with, as the type it stands for. */
function typeOfPath(path: string): ItemType {
  const directory = path.split("/")[0];
  if (directory === "lib") return "registry:lib";
  if (directory === "theme") return "registry:theme";
  if (directory === "hooks") return "registry:hook";
  if (directory === "blocks") return "registry:block";
  if (directory === "components") return "registry:component";
  return "registry:ui";
}

/**
 * Registry path to the file that has it, for everything being written at once.
 *
 * A relative import names another registry file, and where THAT one lands is
 * decided by its own type and `target`. Only the file itself knows those, so
 * the files travelling together are looked up before the path is guessed at.
 */
export type Placed = ReadonlyMap<string, RegistryFile>;

export function placed(items: readonly { readonly files: readonly RegistryFile[] }[]): Placed {
  const out = new Map<string, RegistryFile>();
  for (const item of items) for (const file of item.files) out.set(file.path, file);
  return out;
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
export function rewrite(
  config: Config,
  cwd: string,
  file: RegistryFile,
  together: Placed = new Map(),
): string {
  const here = dirname(targetOf(config, cwd, file));

  return file.content.replaceAll(
    SPECIFIER,
    (_whole, lead: string, quote: string, specifier: string) => {
      // Resolve against the file's position IN THE REGISTRY, which is what the
      // specifier was written against.
      const inRegistry = join(dirname(file.path), specifier).replaceAll("\\", "/");
      const there = targetOf(
        config,
        cwd,
        together.get(inRegistry) ?? { path: inRegistry, type: typeOfPath(inRegistry), content: "" },
      );
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
