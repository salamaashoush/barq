/**
 * A `layer` binding in a production bundle.
 *
 * The compiler leaves `layer("app")` standing for any call through it that it
 * declines, and marks it pure, so a bundle in which every call folded drops it
 * and the `@barqjs/css` runtime behind it. A call it declines is the runtime's
 * to evaluate, through the same binding, in the module that declared it or in
 * one that imported it.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { TMP_DIR } from "./harness.ts";

const native = createRequire(import.meta.url)("../index.js") as {
  transform(
    source: string,
    options: Record<string, unknown>,
  ): {
    code: string;
    css?: string | null;
    warnings: string[];
    cssExports?: string[][];
    cssWanted?: string[][];
  };
};

const CSS = fileURLToPath(new URL("../../css/src/index.ts", import.meta.url));
const WORK = join(TMP_DIR, "layer-bundle");

/** What each compiled module exports that another folds against. */
const exported = new Map<string, string[][]>();

/**
 * Compiled as a build compiles it, with what it asks for from the modules
 * compiled before it, and written where the bundle will find it.
 */
function compiled(name: string, source: string): { code: string; css: string } {
  const options = { filename: join(WORK, name), cssSource: CSS, cssExports: true };
  let out = native.transform(source, options);
  const cssImports = (out.cssWanted ?? []).flatMap(([specifier = "", wanted = ""]) =>
    (exported.get(specifier.replace(/^\.\//, "")) ?? [])
      .filter(([exportedName]) => exportedName === wanted)
      .map((row) => [specifier, ...row]),
  );
  if (cssImports.length > 0) out = native.transform(source, { ...options, cssImports });
  exported.set(name, out.cssExports ?? []);
  writeFileSync(join(WORK, name), out.code);
  return { code: out.code, css: out.css ?? "" };
}

/** Built in a process of its own, with `NODE_ENV=production`, as a page ships. */
async function bundle(entry: string): Promise<string> {
  const build = `
    const built = await Bun.build({ entrypoints: [${JSON.stringify(join(WORK, entry))}], target: "bun", minify: true });
    if (!built.success) throw new Error(built.logs.join("\\n"));
    process.stdout.write(await built.outputs[0].text());
  `;
  return run(["-e", build]);
}

async function run(args: string[]): Promise<string> {
  const child = Bun.spawn(["bun", ...args], {
    env: { ...process.env, NODE_ENV: "production" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(stderr).toBe("");
  expect(status).toBe(0);
  return out;
}

beforeAll(() => {
  mkdirSync(WORK, { recursive: true });
  compiled(
    "shared.ts",
    `import { layer } from ${JSON.stringify(CSS)};
export const ui = layer("app");
export const ring = ui.create({ ring: { outlineWidth: "3px" } });
`,
  );
});

afterAll(() => rmSync(WORK, { recursive: true, force: true }));

test("every call folded, and the binding and the runtime are gone", async () => {
  const card = compiled(
    "card.ts",
    `import { layer } from ${JSON.stringify(CSS)};
const ui = layer("app");
export const a = ui({ color: "red" });
export const b = ui.create({ c: { padding: 4 } }).c;
`,
  );
  expect(card.code).toContain("/* @__PURE__ */ layer(");
  expect(card.css).toContain("@layer app{");
  writeFileSync(join(WORK, "folded.ts"), `import { a, b } from "./card.ts";\nconsole.log(a, b);\n`);
  const shipped = await bundle("folded.ts");
  expect(shipped).toContain("a-color_");
  expect(shipped).not.toContain("barq-css");
  expect(shipped).not.toContain("@layer");
});

test("a declined call is the runtime's, through a binding from another module", async () => {
  // One module calls the binding another declared, with literals the build
  // folds and with values it can only leave to the runtime.
  const page = compiled(
    "page.ts",
    `import { ui, ring } from "./shared.ts";
export const folded = ui(ring.ring, { color: "teal" });
export const tint = (colour: string) => ui(ring.ring, { color: colour });
export const padded = ui.props({ padding: 6 });
export const pad = (size: number) => ui.props({ padding: size });
`,
  );
  expect(page.code).not.toContain('ui(ring.ring, { color: "teal" })');
  expect(page.code).toContain("ui(ring.ring, { color: colour })");
  expect(page.code).not.toContain("ui.props({ padding: 6 })");
  expect(page.code).toContain("ui.props({ padding: size })");
  expect(page.css).toContain("@layer app{");
  writeFileSync(
    join(WORK, "declined.ts"),
    `import { collectCss } from ${JSON.stringify(CSS)};
import { folded, tint, padded, pad } from "./page.ts";
console.log(JSON.stringify({
  folded,
  tint: tint("teal"),
  padded: padded.class,
  pad: pad(6).class,
  sheet: collectCss(),
}));
`,
  );
  writeFileSync(join(WORK, "declined.js"), await bundle("declined.ts"));
  const result = JSON.parse(await run([join(WORK, "declined.js")])) as {
    folded: string;
    tint: string;
    padded: string;
    pad: string;
    sheet: string;
  };
  // The runtime names a declaration as the build did, so a page holding both
  // never carries one declaration as two classes.
  expect(result.tint).toBe(result.folded);
  expect(result.pad).toBe(result.padded);
  const colour = result.tint.split(" ").find((cls) => cls.startsWith("a-color_"));
  expect(result.sheet).toContain("@layer app{");
  expect(result.sheet).toContain(`.${colour}{color:teal}`);
});
