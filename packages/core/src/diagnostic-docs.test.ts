/**
 * The runtime diagnostics and the pages that explain them.
 *
 * Every code the runtime emits has a page under `docs/diagnostics`, every event
 * links to it, and the examples on a page are compiled and, where they need no
 * server, run: the first `tsx` block of a page raises the page's code and
 * nothing else, and the second raises nothing.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";
import { transform } from "@barqjs/compiler-rs";

import * as core from "./index.ts";
import { template } from "./dom.ts";

const SRC = import.meta.dir;
const PAGES = join(SRC, "..", "docs", "diagnostics");
const DOCS_BASE = "https://github.com/salamaashoush/barq/blob/main/packages/core/docs/diagnostics";
/** The engine's codes a failing example may raise beside barq's own. */
const ENGINE_CODES = /^NO_OWNER_EFFECT$/;

/** The runtimes that report on the channel: the renderer, the server renderer, Start. */
const EMITTERS = [
  SRC,
  join(SRC, "..", "..", "server", "src"),
  join(SRC, "..", "..", "start", "src"),
];

function emittedCodes(): string[] {
  const codes = new Set<string>();
  for (const file of EMITTERS.flatMap((dir) => readdirSync(dir).map((name) => join(dir, name)))) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/emitDiagnostic\(\s*\{\s*code: "([A-Z_]+)"/g)) {
      codes.add(match[1]);
    }
  }
  return [...codes].toSorted();
}

function blocks(code: string, language: string): string[] {
  const page = readFileSync(join(PAGES, `${code}.md`), "utf8");
  const fence = new RegExp("```" + language + "\\n([\\s\\S]*?)```", "g");
  return [...page.matchAll(fence)].map((match) => match[1]);
}

function compile(source: string, filename: string): string {
  const out = transform(source, { filename });
  expect(
    out.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    `${filename} does not compile`,
  ).toEqual([]);
  return out.code;
}

/**
 * The runtime an example imports: this checkout's, with `render` recording the
 * roots the example mounts itself, so the runner can dispose them as it does
 * the ones it mounts. A root left mounted keeps listening on its container.
 */
function runtimeFor(directory: string): string {
  const index = JSON.stringify(join(SRC, "index.ts"));
  const file = join(directory, "core.js");
  writeFileSync(
    file,
    `export * from ${index};\n` +
      `import { render as mount } from ${index};\n` +
      `export const roots = [];\n` +
      `export function render(...args) { const dispose = mount(...args); roots.push(dispose); return dispose; }\n`,
  );
  return file;
}

/** Load a compiled example against this checkout's runtime and mount what it exports. */
async function run(source: string, name: string): Promise<string[]> {
  const directory = mkdtempSync(join(tmpdir(), "barq-diagnostic-docs-"));
  const runtime = runtimeFor(directory);
  const body = compile(source, name).replaceAll(
    'from "@barqjs/core"',
    `from ${JSON.stringify(runtime)}`,
  );
  expect(body, `${name} imports something this loader does not provide`).not.toMatch(
    /^import .* from "[^/]/m,
  );

  const file = join(directory, `${name}.js`);
  writeFileSync(file, body);
  const capture = core.DEV.diagnostics.capture();
  const disposers: (() => void)[] = [];
  try {
    const { roots } = (await import(runtime)) as { roots: (() => void)[] };
    disposers.push(() => {
      for (const dispose of roots) dispose();
    });
    const components = (await import(file)) as Record<string, unknown>;
    for (const component of Object.values(components)) {
      if (typeof component !== "function") continue;
      const host = document.createElement("div");
      document.body.append(host);
      disposers.push(
        core.render(() => (component as (props: object) => core.JSXElement)({}), host),
      );
    }
    core.flush();
  } finally {
    for (const dispose of disposers) dispose();
    document.body.textContent = "";
    rmSync(directory, { recursive: true, force: true });
  }
  return capture.stop().map((event) => event.code);
}

afterEach(() => {
  document.body.textContent = "";
});

describe("every runtime diagnostic has a page", () => {
  const codes = emittedCodes();

  test("the codes the runtime emits are the pages on disk", () => {
    expect(codes).toEqual([
      "BIND_TARGET_NOT_WRITABLE",
      "BLOCK_EVALUATED_TWICE",
      "DELEGATED_EVENT_DOES_NOT_BUBBLE",
      "FUNCTION_AS_ATTRIBUTE",
      "HYDRATION_MISMATCH",
      "HYDRATION_SEED_DRIFT",
      "LATE_HEADER_WRITE",
      "RENDER_SUBTREE_NOT_OWNED",
      "SERVER_FUNCTION_FAILED",
      "SSR_RENDER_ERROR_CONTAINED",
    ]);
    const pages = readdirSync(PAGES)
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.slice(0, -3))
      .toSorted();
    expect(pages).toEqual(codes);
    for (const code of codes) {
      expect(readFileSync(join(PAGES, `${code}.md`), "utf8")).toStartWith(`# ${code}\n`);
    }
  });

  test("an event carries the address of its page", () => {
    const capture = core.DEV.diagnostics.capture();
    core.render(document.createElement("span"), document.createElement("div"))();
    const [event] = capture.stop();
    expect(event?.code).toBe("RENDER_SUBTREE_NOT_OWNED");
    expect(event?.docs).toBe(`${DOCS_BASE}/RENDER_SUBTREE_NOT_OWNED.md`);
    expect(existsSync(join(PAGES, "RENDER_SUBTREE_NOT_OWNED.md"))).toBe(true);
  });

  for (const code of codes) {
    test(`${code}: every example on the page compiles`, () => {
      const tsx = blocks(code, "tsx");
      expect(tsx.length).toBeGreaterThan(0);
      tsx.forEach((source, index) => compile(source, `${code}-${index}.tsx`));
      blocks(code, "ts").forEach((source, index) => compile(source, `${code}-${index}.ts`));
    });
  }
});

describe("the examples that need no server do what their page says", () => {
  for (const code of [
    "BIND_TARGET_NOT_WRITABLE",
    "DELEGATED_EVENT_DOES_NOT_BUBBLE",
    "FUNCTION_AS_ATTRIBUTE",
    "RENDER_SUBTREE_NOT_OWNED",
  ]) {
    test(`${code}: the failing example raises it and the fixed one raises nothing`, async () => {
      const [failing, fixed] = blocks(code, "tsx");
      // The engine reports on the same channel, so the mistake can also raise
      // the engine's own code for what it broke (an effect with no owner).
      const raised = await run(failing, `${code}-failing.tsx`);
      expect(raised.filter((raisedCode) => !ENGINE_CODES.test(raisedCode))).toEqual([code]);
      expect(await run(fixed, `${code}-fixed.tsx`)).toEqual([]);
    });
  }

  test("BLOCK_EVALUATED_TWICE: the example on the page is quiet", async () => {
    const [quiet] = blocks("BLOCK_EVALUATED_TWICE", "tsx");
    expect(await run(quiet, "BLOCK_EVALUATED_TWICE-quiet.tsx")).toEqual([]);
  });
});

describe("a hydration mismatch says what was sent, why, and what happened", () => {
  test("the page-level report names both elements, the usual causes and the outcome", () => {
    const container = document.createElement("div");
    container.innerHTML = "<main>Welcome back</main>";
    document.body.append(container);
    const view = template("<div>Welcome back</div>");
    const capture = core.DEV.diagnostics.capture();
    const dispose = core.hydrate(() => view(), container);
    const events = capture.stop().filter((event) => event.code === "HYDRATION_MISMATCH");

    expect(core.hydrate.report.recovered).toBe(true);
    expect(container.innerHTML).toBe("<div>Welcome back</div>");
    expect(events).toHaveLength(1);
    const message = events[0]?.message ?? "";
    expect(message).toStartWith(
      "Hydration mismatch (structure): the server sent `<main>` where the browser builds `<div>`. ",
    );
    expect(message).toContain("a branch on `typeof window`");
    expect(message).toContain("a `<div>` inside a `<p>`");
    expect(message).toEndWith(
      "The server's markup was discarded and the whole page was rendered again in the browser, " +
        "so it works but the server-rendered first paint was thrown away.",
    );
    expect(events[0]?.docs).toBe(`${DOCS_BASE}/HYDRATION_MISMATCH.md`);
    expect(core.hydrate.report.mismatches.map((mismatch) => mismatch.kind)).toEqual(["structure"]);
    dispose();
  });

  test("markup nothing was reused from is reported as not hydratable, with the option to set", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>served</p>";
    document.body.append(container);
    const capture = core.DEV.diagnostics.capture();
    const dispose = core.hydrate(() => document.createElement("p"), container);
    const events = capture.stop().filter((event) => event.code === "HYDRATION_MISMATCH");

    expect(events).toHaveLength(1);
    expect(events[0]?.message).toStartWith(
      "Hydration mismatch (not-hydratable): the container holds markup and `hydrate` reused none of it",
    );
    expect(events[0]?.message).toContain(
      "Set `ssr: true` in `barq()` from `@barqjs/vite`, which compiles both the server build and the browser build hydratable",
    );
    dispose();
  });

  test("a value nobody asked for is reported with the fix that makes a mismatch fetch again", () => {
    const container = document.createElement("div");
    const capture = core.DEV.diagnostics.capture();
    const dispose = core.hydrate(() => document.createTextNode("ok"), container, {
      data: { "r9~salama": "a value this page never asks for" },
    });
    const events = capture.stop().filter((event) => event.code === "HYDRATION_SEED_DRIFT");
    dispose();

    expect(events).toHaveLength(1);
    expect(events[0]?.message).toStartWith(
      "The server sent 1 async value that no `createMemo` in the browser asked for (r9~salama). ",
    );
    expect(events[0]?.message).toEndWith('`createMemo(load, { name: "user" })`.');
    expect(events[0]?.docs).toBe(`${DOCS_BASE}/HYDRATION_SEED_DRIFT.md`);
  });
});
