/**
 * What a page that only renders does not ship.
 *
 * Each of these was once kept in every production bundle by a guard no
 * minifier folds, so the bundle is built here and searched: the cause texts of
 * a hydration mismatch, the frame around an event handler, and the diagnostics
 * channel behind `DEV`.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "bun:test";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Built in a process of its own with `NODE_ENV=production`: `bun test` sets it
 * to `test`, under which a build resolves the development entries.
 */
async function bundle(source: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "barq-bundle-"));
  try {
    const entry = join(dir, "entry.ts");
    writeFileSync(entry, source);
    const build = `
      const built = await Bun.build({ entrypoints: [${JSON.stringify(entry)}], target: "browser", minify: true });
      if (!built.success) throw new Error(built.logs.join("\\n"));
      process.stdout.write(await built.outputs[0].text());
    `;
    const child = Bun.spawn(["bun", "-e", build], {
      env: { ...process.env, NODE_ENV: "production" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stderr, status] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(stderr).toBe("");
    expect(status).toBe(0);
    return code;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const RENDERS = `
  import { render, template, insert, delegateEvents } from ${JSON.stringify(join(HERE, "index.ts"))};
  import { createSignal } from ${JSON.stringify(join(HERE, "../../core/src/index.ts"))};
  const [count, setCount] = createSignal(0);
  const view = template("<button> </button>");
  delegateEvents(["click"]);
  render(() => {
    const button = view();
    button.__bq_click = () => setCount(count() + 1);
    insert(button, count);
    return button;
  }, document.body);
`;

test("a page that renders carries none of what only hydration or development reads", async () => {
  const code = await bundle(RENDERS);
  expect(code).toContain("__bq_click");
  expect(code).not.toContain("This usually means");
  expect(code).not.toContain("withInteraction");
  expect(code).not.toContain("subscribe");
});

test("a page that hydrates carries the cause texts", async () => {
  const code = await bundle(
    `import { hydrate } from ${JSON.stringify(join(HERE, "index.ts"))};\nhydrate(() => document.createElement("p"), document.body);\n`,
  );
  expect(code).toContain("This usually means");
});
