import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface ImportGraph {
  /** Every package specifier on the way, with how it is imported. */
  packages: Map<string, Set<string>>;
  /** Every file inside this package a static import reaches. */
  files: Set<string>;
}

/**
 * Every static import a module makes, and the modules it reaches, inside this
 * package; and every package specifier on the way, with how it is imported.
 */
export function importGraph(entry: string): ImportGraph {
  const transpiler = new Bun.Transpiler({ loader: "tsx" });
  const packages = new Map<string, Set<string>>();
  const files = new Set<string>();
  const visit = (file: string): void => {
    if (files.has(file)) return;
    files.add(file);
    const source = readFileSync(file, "utf8");
    for (const one of transpiler.scanImports(source)) {
      if (one.path.startsWith(".")) {
        if (one.kind !== "dynamic-import") visit(join(dirname(file), one.path));
        continue;
      }
      const set = packages.get(one.path) ?? new Set<string>();
      set.add(one.kind);
      packages.set(one.path, set);
    }
  };
  visit(entry);
  return { packages, files };
}
