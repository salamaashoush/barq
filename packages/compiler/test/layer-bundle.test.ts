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
  ): { code: string; css?: string | null; warnings: string[] };
};

const CSS = fileURLToPath(new URL("../../css/src/index.ts", import.meta.url));
const WORK = join(TMP_DIR, "layer-bundle");

/** Compiled as a build compiles it, and written where the bundle will find it. */
function compiled(name: string, source: string): { code: string; css: string } {
  const out = native.transform(source, { filename: join(WORK, name), cssSource: CSS });
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
  const page = compiled(
    "page.ts",
    `import { ui, ring } from "./shared.ts";
export const tint = (colour: string) => ui(ring.ring, { color: colour });
export const pad = (size: number) => ui.props({ padding: size });
`,
  );
  expect(page.code).toContain("ui(");
  writeFileSync(
    join(WORK, "declined.ts"),
    `import { collectCss } from ${JSON.stringify(CSS)};
import { tint, pad } from "./page.ts";
console.log(JSON.stringify({ tint: tint("teal"), pad: pad(6).class, sheet: collectCss() }));
`,
  );
  writeFileSync(join(WORK, "declined.js"), await bundle("declined.ts"));
  const result = JSON.parse(await run([join(WORK, "declined.js")])) as {
    tint: string;
    pad: string;
    sheet: string;
  };
  // The group's class is the compiled one, kept beside the runtime's own: its
  // rule is in the stylesheet the build wrote, not in the runtime's.
  const [group, colour] = result.tint.split(" ");
  expect(group).toStartWith("a-outline-width_");
  expect(result.sheet).toContain("@layer app{");
  expect(result.sheet).toContain(`.${colour}{color:teal}`);
  for (const cls of result.pad.split(" ")) expect(result.sheet).toContain(`.${cls}{padding-`);
});
