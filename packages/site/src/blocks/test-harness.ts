/**
 * A block, written by the server and claimed by the client.
 *
 * The suite's own loader compiles `.tsx` for the DOM, so importing a block in a
 * test measures one backend. The site ships two lowerings of every block, the
 * string one `barqStart` renders and the hydratable DOM one that claims it, and
 * a block that reads `window` while building, or numbers its ids differently
 * on each side, fails only where both run. So each half is BUNDLED with the
 * compiler options `vite.config.ts` passes, and the pair goes through
 * `renderAndHydrate`.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderAndHydrate, type HydrationResult } from "@barqjs/testing";

import { barqPlugin } from "./test-setup.ts";

const blocks = fileURLToPath(new URL(".", import.meta.url));
// Inside the package rather than the system temp directory: the built module
// imports `@barqjs/server`, and resolution walks up from where the file IS.
const modules = fileURLToPath(new URL("../../node_modules/", import.meta.url));

type Component = () => never;

async function half(
  workspace: string,
  file: string,
  component: string,
  ssr: boolean,
): Promise<Component> {
  const side = ssr ? "ssr" : "dom";
  const entry = join(workspace, `probe-${side}.ts`);
  writeFileSync(entry, `export { ${component} as Page } from ${JSON.stringify(blocks + file)};\n`);

  const result = await Bun.build({
    entrypoints: [entry],
    target: "bun",
    format: "esm",
    plugins: [barqPlugin({ ssr, hydratable: true, every: true })],
    // One runtime for the bundle and this file: two copies of the scheduler
    // mean the markup is built under a scope the walk cannot see.
    external: ["@barqjs/core", "@barqjs/css", "@barqjs/server"],
  });
  if (!result.success) {
    throw new AggregateError(
      result.logs,
      `the ${ssr ? "server" : "client"} half of ${file} did not build`,
    );
  }

  const built = join(workspace, `built-${side}.mjs`);
  writeFileSync(built, await (result.outputs[0] as { text(): Promise<string> }).text());
  const mod = (await import(built)) as { Page: Component };
  return mod.Page;
}

/**
 * The block through `renderToStream`, which is what the router answers a
 * request with, in a process that has no DOM at all.
 *
 * `hydrateBlock` renders its server half HERE, where happy-dom has already
 * given the process a `document`, so a block that opens an overlay from a
 * settled effect, or reads `window` while building, passes it and takes the
 * real server down. The effects a render schedules run after the markup is
 * returned, which is why the child waits before it reports.
 */
export async function serverRender(
  file: string,
  component: string,
): Promise<{ code: number; html: string; errors: string }> {
  const workspace = mkdtempSync(join(modules, "barq-site-blocks-"));
  try {
    const entry = join(workspace, "probe-ssr.ts");
    writeFileSync(
      entry,
      `export { ${component} as Page } from ${JSON.stringify(blocks + file)};\n`,
    );
    const result = await Bun.build({
      entrypoints: [entry],
      target: "bun",
      format: "esm",
      plugins: [barqPlugin({ ssr: true, hydratable: true, every: true })],
      external: ["@barqjs/core", "@barqjs/css", "@barqjs/server"],
    });
    if (!result.success) {
      throw new AggregateError(result.logs, `the server half of ${file} did not build`);
    }
    writeFileSync(
      join(workspace, "built-ssr.mjs"),
      await (result.outputs[0] as { text(): Promise<string> }).text(),
    );
    writeFileSync(
      join(workspace, "render.mjs"),
      [
        'import { renderToStream } from "@barqjs/server";',
        'import { Page } from "./built-ssr.mjs";',
        "const html = await new Response(renderToStream(Page).readable).text();",
        "await new Promise((resolve) => setTimeout(resolve, 20));",
        "process.stdout.write(html);",
        "",
      ].join("\n"),
    );

    const child = Bun.spawn(["bun", join(workspace, "render.mjs")], {
      cwd: workspace,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    const [html, errors] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { code: await child.exited, html, errors };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

/**
 * `file` is the block's module in this directory and `component` its export.
 *
 * The caller unmounts: the result's container is live, so a test can press
 * what the server wrote and see whether the walk bound it.
 */
export async function hydrateBlock(file: string, component: string): Promise<HydrationResult> {
  // A directory per call, gone once both halves are loaded. One shared by the
  // run would need a teardown, and a hook registered in a module bun evaluates
  // once belongs to whichever test file imported it first.
  const workspace = mkdtempSync(join(modules, "barq-site-blocks-"));
  try {
    const server = await half(workspace, file, component, true);
    const client = await half(workspace, file, component, false);
    return renderAndHydrate({ server, client });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}
