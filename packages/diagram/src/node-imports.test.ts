/**
 * What a server running on Node can load.
 *
 * A dev server renders on Node and leaves a dependency external, so Node
 * itself loads what this package imports. Two did not load there and took
 * every server-rendered page with a diagram down under `vite dev`: roughjs's
 * `bin/` files are ES modules whose own imports name no extension, and
 * `@excalidraw/laser-pointer`'s CommonJS build exports nothing Node can read
 * by name. Bun resolves both anyway, so only Node can say.
 */

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Glob } from "bun";

const root = fileURLToPath(new URL(".", import.meta.url));

interface Wanted {
  readonly from: string;
  readonly names: readonly string[];
  readonly defaulted: boolean;
}

/** Every binding a runtime import in `src` takes from another package. */
function wanted(): Wanted[] {
  const out: Wanted[] = [];
  for (const path of new Glob("**/*.{ts,tsx}").scanSync({ cwd: root })) {
    if (/\.test\.|harness|^fixtures\/|^test-/.test(path)) continue;
    const source = readFileSync(`${root}${path}`, "utf8");
    for (const match of source.matchAll(/^import (?!type )([^;]*?) from "([^".][^"]*)";/gms)) {
      const [, clause = "", from = ""] = match;
      if (from.startsWith("@barqjs/") || from.startsWith("node:") || from.startsWith("bun"))
        continue;
      const names = (/\{([^}]*)\}/.exec(clause)?.[1] ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== "" && !name.startsWith("type "))
        .map((name) => name.split(/\s+as\s+/)[0] ?? name);
      out.push({ from, names, defaulted: /^[A-Za-z_$][\w$]*\s*(,|$)/.test(clause.trim()) });
    }
  }
  return out;
}

test("Node loads every binding this package imports from another package", async () => {
  const imports = wanted();
  expect(imports.some((one) => one.from.startsWith("roughjs"))).toBe(true);
  const script = `
    const missing = [];
    for (const { from, names, defaulted } of ${JSON.stringify(imports)}) {
      let module;
      try { module = await import(from); } catch (error) { missing.push(from + ": " + error.message.split("\\n")[0]); continue; }
      for (const name of names) if (!(name in module)) missing.push(from + ": no export " + name);
      if (defaulted && module.default === undefined) missing.push(from + ": no default export");
    }
    process.stdout.write(JSON.stringify(missing));
  `;
  const child = Bun.spawn(["node", "--input-type=module", "-e", script], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  expect(code).toBe(0);
  expect(JSON.parse(out)).toEqual([]);
});
