/**
 * What a page that only renders does not ship.
 *
 * Each of these was once kept in every production bundle by a guard no
 * minifier folds, so the bundle is built here and searched: the cause texts of
 * a hydration mismatch, what control flow and `insert` do with the server's
 * nodes and the reports they write about them, the frame around an event
 * handler, the diagnostics channel behind `DEV`, and the words of the findings
 * a page raises while nothing can hear them.
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

const WEB = JSON.stringify(join(HERE, "index.ts"));
// The entry `index.ts` resolves `@barqjs/core` to under the build's conditions,
// so the page and the renderer share one copy of core.
const CORE = JSON.stringify(join(HERE, "../../core/dist/index.js"));

const RENDERS = `
  import { render, template, insert, delegateEvents, each, branch, boundary } from ${WEB};
  import { block, createSignal } from ${CORE};
  const [count, setCount] = createSignal(0);
  const view = template("<button> </button>");
  const list = template("<ul></ul>");
  delegateEvents(["click", "focus"]);
  render(() => {
    const button = view();
    button.__bq_click = () => setCount(count() + 1);
    insert(button, count);
    const ul = list();
    each(ul, null, () => [1, 2], null, block((n) => String(n)));
    branch(ul, null, () => count() % 2, [null, block(() => "odd")]);
    boundary(ul, null, "loading", null, block(() => "ready"));
    return [button, ul];
  }, document.body);
`;

/** Prose only a claim writes: the reports of what did not match, and their causes. */
const CLAIM_PROSE = [
  "This usually means",
  "the rest of the server's markup was reused",
  "hydratable: true",
];

/** The words of findings `render`, `delegateEvents` and `each` can raise. */
const FINDING_PROSE = [
  "were built before the call",
  "event does not bubble",
  "was built twice for a single render",
];

test("a page that renders carries none of what only hydration or development reads", async () => {
  const code = await bundle(RENDERS);
  expect(code).toContain("__bq_click");
  for (const text of CLAIM_PROSE) expect(code).not.toContain(text);
  expect(code).not.toContain("HydrationMismatch");
  expect(code).not.toContain("withInteraction");
  expect(code).not.toContain("subscribe");
  expect(code).not.toContain("/packages/core/docs/diagnostics");
  for (const text of FINDING_PROSE) expect(code).not.toContain(text);
});

test("a page that hydrates carries the claims and their reports", async () => {
  const code = await bundle(
    `import { hydrate } from ${WEB};\nhydrate(() => document.createElement("p"), document.body);\n`,
  );
  for (const text of CLAIM_PROSE) expect(code).toContain(text);
  expect(code).toContain("HydrationMismatch");
});

test("a page that subscribes to diagnostics carries the findings' words", async () => {
  const code = await bundle(`${RENDERS}
    import { DEV } from ${CORE};
    DEV.diagnostics.subscribe((event) => console.log(event.message));
  `);
  for (const text of FINDING_PROSE) expect(code).toContain(text);
});
