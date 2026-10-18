/**
 * Code as a project that ran `barq-ui add` holds it.
 *
 * The site imports `@barqjs/ui` from the workspace, but nobody else can: a
 * project owns copies at the paths `components.json` defaults to. So every
 * import of the package in shown code names the copied file instead, read from
 * the registry's index and the package's export map so a component added upstream needs
 * no entry here.
 */

import index from "../../../ui/registry/index.json";
import manifest from "../../../ui/package.json";

/** Where `barq-ui init` puts each kind of file, from a module beside `src/components`. */
const PLACES: Readonly<Record<string, string>> = {
  ui: "./components/ui/",
  lib: "./components/lib/",
  theme: "./components/theme/",
  hooks: "./hooks/",
};

function copiedPath(file: string): string {
  const slash = file.indexOf("/");
  const place = PLACES[file.slice(0, slash)];
  if (place === undefined) throw new Error(`no copied location for src/${file}`);
  return place + file.slice(slash + 1);
}

const byName = new Map<string, string>();
for (const item of index.items as readonly { files: string[]; exports?: string[] }[]) {
  for (const name of item.exports ?? []) byName.set(name, item.files[0] as string);
}

const bySubpath = new Map<string, string>();
for (const [key, value] of Object.entries(manifest.exports as Record<string, unknown>)) {
  const target = (value as { barq?: string }).barq;
  if (target !== undefined) bySubpath.set(key.slice(2), target.replace(/^\.\/src\//, ""));
}

function importLine(kind: string, names: readonly string[], specifier: string): string {
  const flat = `import ${kind}{ ${names.join(", ")} } from "${specifier}";`;
  return flat.length <= 100
    ? flat
    : `import ${kind}{\n${names.map((name) => `  ${name},`).join("\n")}\n} from "${specifier}";`;
}

const IMPORT = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']@barqjs\/ui(?:\/([^"']+))?["'];?/g;

export function asCopied(code: string): string {
  return code.replaceAll(
    IMPORT,
    (_whole, kind: string | undefined, clause: string, sub?: string) => {
      const names = clause
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== "");
      const byFile = new Map<string, string[]>();
      for (const name of names) {
        const exported = name.replace(/^type\s+/, "").split(/\s+as\s+/)[0] as string;
        const file = sub === undefined ? byName.get(exported) : bySubpath.get(sub);
        if (file === undefined) {
          throw new Error(`@barqjs/ui${sub === undefined ? "" : `/${sub}`} has no ${exported}`);
        }
        byFile.set(file, [...(byFile.get(file) ?? []), name]);
      }
      return [...byFile]
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([file, list]) => importLine(kind ?? "", list, copiedPath(file)))
        .join("\n");
    },
  );
}
