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

import { hashOf, placed, read, rewrite, targetOf, write } from "./files.ts";
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
  /** What the registry has for it, with its imports pointed at this project. */
  readonly incoming: string;
  /** What was on disk before, when there was anything. */
  readonly existing?: string;
}

export interface AddOptions {
  readonly overwrite?: boolean;
  /** Decide every outcome and write nothing, so the answer can be shown first. */
  readonly dryRun?: boolean;
}

export function applyItems(
  config: Config,
  root: string,
  items: readonly RegistryItem[],
  options: AddOptions = {},
): { files: WrittenFile[]; config: Config } {
  const files: WrittenFile[] = [];
  const recorded: Record<string, Record<string, string>> = { ...config.items };
  const together = placed(items);
  const put = options.dryRun === true ? (): void => {} : write;

  // Every destination first, and only then any write. `targetOf` refuses a
  // path that leaves the project, and an item refused at its third file must
  // not have left the first two behind.
  const planned = items.map((item) => ({
    item,
    files: item.files.map((file) => {
      const absolute = targetOf(config, root, file);
      return {
        key: file.path,
        absolute,
        path: relative(root, absolute).replaceAll("\\", "/"),
        incoming: rewrite(config, root, file, together),
      };
    }),
  }));

  for (const { item, files: own } of planned) {
    const forItem: Record<string, string> = { ...recorded[item.name] };

    for (const { key, absolute, path, incoming } of own) {
      const hash = hashOf(incoming);
      const existing = read(absolute);
      const common = { item: item.name, path, absolute, incoming };

      if (existing === undefined) {
        put(absolute, incoming);
        files.push({ ...common, outcome: "written", hash });
      } else if (existing === incoming) {
        files.push({ ...common, outcome: "unchanged", hash, existing });
      } else if (options.overwrite === true || hashOf(existing) === forItem[key]) {
        put(absolute, incoming);
        files.push({ ...common, outcome: "replaced", hash, existing });
      } else {
        files.push({ ...common, outcome: "kept", hash: hashOf(existing), existing });
        continue;
      }
      forItem[key] = hash;
    }

    recorded[item.name] = forItem;
  }

  return { files, config: { ...config, items: recorded } };
}

/** `zod@^3` and `@acme/kit@1` are `zod` and `@acme/kit` in a `package.json`. */
function packageName(dependency: string): string {
  const at = dependency.indexOf("@", 1);
  return at < 0 ? dependency : dependency.slice(0, at);
}

/**
 * The npm packages these items want, minus what the project already has.
 *
 * `field` is which list to read: what the code imports, or what only its build
 * and its tests need.
 */
export function missingDependencies(
  items: readonly RegistryItem[],
  installed: ReadonlySet<string>,
  field: "dependencies" | "devDependencies" = "dependencies",
): string[] {
  const wanted = new Set<string>();
  for (const item of items) {
    for (const dependency of item[field]) {
      if (!installed.has(packageName(dependency))) wanted.add(dependency);
    }
  }
  return [...wanted].toSorted();
}
