import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderRoute } from "@barqjs/testing/router";

import { CATALOG } from "./blocks/catalog.ts";
import { barqPlugin } from "./blocks/test-setup.ts";
import { CHART_TYPES } from "./charts/index.tsx";
import { PAGES } from "./docs/guides/index.ts";
import { COMPONENTS } from "./docs/index.ts";
import { routeTree } from "./routeTree.gen.ts";

const source = fileURLToPath(new URL(".", import.meta.url));
// Inside the package rather than the system temp directory: the built module
// imports `@barqjs/server`, and resolution walks up from where the file IS.
const modules = fileURLToPath(new URL("../node_modules/", import.meta.url));

/** Every address the site answers, which is every route with every parameter it takes. */
export const PATHS: readonly string[] = [
  "/",
  "/colors",
  "/create",
  "/blocks",
  ...CATALOG.map((block) => `/blocks/${block.name}`),
  ...CHART_TYPES.map((chart) => `/charts/${chart.type}`),
  ...PAGES.map((guide) => `/docs/${guide.slug}`),
  "/docs/components",
  ...COMPONENTS.map((component) => `/docs/components/${component.slug}`),
];

interface Answer {
  readonly path: string;
  readonly status: number;
  readonly length: number;
  readonly pending: boolean;
  readonly heading: boolean;
  /** What the page threw, while rendering or from an effect it scheduled. */
  readonly errors: readonly string[];
}

/**
 * Every path through the page handler, in a process that has no DOM at all.
 *
 * The suite's own process has happy-dom's `document`, so a page that reads
 * `window` while building passes here and takes the real server down. The
 * route table is bundled once with the string backend and a child asks it for
 * each page; the effects a render schedules run after the markup is returned,
 * which is why the child waits after each page before it moves to the next,
 * and an error nothing caught halts the engine for good, so the halt is lifted
 * between pages or one bad page would hide every failure after it.
 */
async function serve(paths: readonly string[]): Promise<{
  code: number;
  errors: string;
  answers: readonly Answer[];
}> {
  const workspace = mkdtempSync(join(modules, "barq-site-routes-"));
  try {
    const entry = join(workspace, "handler.ts");
    writeFileSync(
      entry,
      [
        'import { createPageHandler, renderRoutes } from "@barqjs/router/server";',
        `import { routeTree } from ${JSON.stringify(join(source, "routeTree.gen.ts"))};`,
        "export const handler = createPageHandler({",
        "  routeTree,",
        "  app: (state) => renderRoutes(state),",
        "  stream: false,",
        "});",
        "",
      ].join("\n"),
    );
    const result = await Bun.build({
      entrypoints: [entry],
      target: "bun",
      format: "esm",
      plugins: [barqPlugin({ ssr: true, hydratable: true, every: true })],
      // The handler's own defaults import what only the Vite plugins provide;
      // every one is behind an option this passes, so none is ever asked for.
      external: [
        "@barqjs/core",
        "@barqjs/web",
        "@barqjs/css",
        "@barqjs/server",
        "virtual:*",
        "#barq-*",
      ],
    });
    if (!result.success) throw new AggregateError(result.logs, "the route table did not build");
    writeFileSync(
      join(workspace, "handler.mjs"),
      await (result.outputs[0] as { text(): Promise<string> }).text(),
    );
    writeFileSync(
      join(workspace, "serve.mjs"),
      [
        'import { resetErrorHalt } from "@barqjs/core";',
        'import { handler } from "./handler.mjs";',
        `const paths = ${JSON.stringify(paths)};`,
        "const answers = [];",
        "let errors = [];",
        'process.on("uncaughtException", (error) => errors.push(String(error?.stack ?? error)));',
        'process.on("unhandledRejection", (error) => errors.push(String(error?.stack ?? error)));',
        "for (const path of paths) {",
        "  resetErrorHalt();",
        "  errors = [];",
        "  let status = 0;",
        '  let html = "";',
        "  try {",
        '    const response = await handler(new Request("http://localhost" + path));',
        "    status = response.status;",
        "    html = await response.text();",
        "  } catch (error) {",
        "    errors.push(String(error?.stack ?? error));",
        "  }",
        "  await new Promise((resolve) => setTimeout(resolve, 20));",
        "  answers.push({",
        "    path,",
        "    status,",
        "    length: html.length,",
        '    pending: html.includes("<!--[b:"),',
        '    heading: html.includes("<h1") || html.includes(\'data-slot="block-page"\'),',
        "    errors,",
        "  });",
        "}",
        "process.stdout.write(JSON.stringify(answers));",
        "",
      ].join("\n"),
    );

    const child = Bun.spawn(["bun", join(workspace, "serve.mjs")], {
      cwd: workspace,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    const [out, errors] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    const code = await child.exited;
    return { code, errors, answers: code === 0 ? (JSON.parse(out) as Answer[]) : [] };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

describe("every route", () => {
  test("is answered by a server with no DOM, whole", async () => {
    const result = await serve(PATHS);
    expect(result.code).toBe(0);
    expect(result.answers.map((answer) => answer.path)).toEqual([...PATHS]);

    const wrong = result.answers.filter(
      (answer) =>
        answer.status !== 200 ||
        answer.pending ||
        !answer.heading ||
        answer.length < 500 ||
        answer.errors.length > 0,
    );
    expect(wrong).toEqual([]);
    expect(result.errors).toBe("");
  }, 120_000);

  for (const path of PATHS) {
    test(`${path} renders on the client`, async () => {
      const page = await renderRoute({ routeTree, path });
      expect(page.state.location().pathname).toBe(path);
      expect(
        page.container.querySelector(
          'h1, [data-slot="create"], [data-slot="block-page"] [data-slot]',
        ),
      ).not.toBeNull();
      page.unmount();
    });
  }
});
