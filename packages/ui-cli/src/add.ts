/**
 * `add`: the item, everything it needs, and the files that result.
 *
 * A file already on disk is the only interesting case. Three answers, and which
 * one applies is decided by the hash `components.json` recorded when the file
 * was written:
 *
 * - **The same content**: nothing to do, and nothing is said about it.
 * - **Unchanged since it was added**: replaced, because the project did not
 *   write it.
 * - **Edited**: left alone and reported, unless `--overwrite`. That is the
 *   whole point of owning the code, and a tool that silently reverted an edit
 *   would be taking it back.
 */

import { relative } from "node:path";

import { hashOf, read, rewrite, targetOf, write } from "./files.ts";
import type { RegistryItem } from "./schema.ts";
import type { Config } from "./schema.ts";

export type Outcome = "written" | "replaced" | "unchanged" | "kept";

export interface WrittenFile {
  readonly item: string;
  /** Relative to the project root, for printing. */
  readonly path: string;
  readonly absolute: string;
  readonly outcome: Outcome;
  /** The content on disk now, and what its hash is recorded as. */
  readonly hash: string;
}

export interface AddOptions {
  readonly overwrite?: boolean;
}

export function applyItems(
  config: Config,
  root: string,
  items: readonly RegistryItem[],
  options: AddOptions = {},
): { files: WrittenFile[]; config: Config } {
  const files: WrittenFile[] = [];
  const recorded: Record<string, Record<string, string>> = { ...config.items };

  for (const item of items) {
    const forItem: Record<string, string> = { ...recorded[item.name] };

    for (const file of item.files) {
      const absolute = targetOf(config, root, file);
      const path = relative(root, absolute).replaceAll("\\", "/");
      const next = rewrite(config, root, file);
      const hash = hashOf(next);
      const existing = read(absolute);

      if (existing === undefined) {
        write(absolute, next);
        files.push({ item: item.name, path, absolute, outcome: "written", hash });
      } else if (existing === next) {
        files.push({ item: item.name, path, absolute, outcome: "unchanged", hash });
      } else if (options.overwrite === true || hashOf(existing) === forItem[file.path]) {
        write(absolute, next);
        files.push({ item: item.name, path, absolute, outcome: "replaced", hash });
      } else {
        files.push({
          item: item.name,
          path,
          absolute,
          outcome: "kept",
          hash: hashOf(existing),
        });
        continue;
      }
      forItem[file.path] = hash;
    }

    recorded[item.name] = forItem;
  }

  return { files, config: { ...config, items: recorded } };
}

/** The npm packages these items want, minus what the project already has. */
export function missingDependencies(
  items: readonly RegistryItem[],
  installed: ReadonlySet<string>,
): string[] {
  const wanted = new Set<string>();
  for (const item of items) {
    for (const dependency of item.dependencies) {
      if (!installed.has(dependency)) wanted.add(dependency);
    }
  }
  return [...wanted].toSorted();
}
