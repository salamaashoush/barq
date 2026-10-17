/**
 * A guide's body, written by the server and claimed by the client.
 *
 * The same arrangement as the examples' harness: the body is bundled once per
 * side with the compiler options `vite.config.ts` passes and hydrated inside
 * an element, which is where the page puts it.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { flush } from "@barqjs/core";
import { renderAndHydrate, type HydrationResult } from "@barqjs/testing";

import { barqPlugin } from "../../blocks/test-setup.ts";

const guides = fileURLToPath(new URL(".", import.meta.url));
// Inside the package rather than the system temp directory: the built module
// imports `@barqjs/server`, and resolution walks up from where the file IS.
const modules = fileURLToPath(new URL("../../../node_modules/", import.meta.url));

type Page = () => never;

const frame = (slug: string): string =>
  [
    `import { Body } from ${JSON.stringify(join(guides, `${slug}.tsx`))};`,
    'export const page = () => <div data-slot="guide"><Body /></div>;',
    "",
  ].join("\n");

async function half(workspace: string, slug: string, ssr: boolean): Promise<Page> {
  const side = ssr ? "ssr" : "dom";
  const entry = join(workspace, `frame-${side}.tsx`);
  writeFileSync(entry, frame(slug));
  const result = await Bun.build({
    entrypoints: [entry],
    target: "bun",
    format: "esm",
    plugins: [barqPlugin({ ssr, hydratable: true, every: true })],
    // One runtime for the bundle and this file: two copies of the scheduler
    // mean the markup is built under a scope the walk cannot see.
    external: ["@barqjs/core", "@barqjs/web", "@barqjs/css", "@barqjs/server"],
  });
  if (!result.success) {
    throw new AggregateError(
      result.logs,
      `the ${ssr ? "server" : "client"} half of the ${slug} guide did not build`,
    );
  }

  const built = join(workspace, `built-${side}.mjs`);
  writeFileSync(built, await (result.outputs[0] as { text(): Promise<string> }).text());
  return ((await import(built)) as { page: Page }).page;
}

/** The caller unmounts: the container is live, so a test can press what the server wrote. */
export async function hydrateGuide(slug: string): Promise<HydrationResult> {
  const workspace = mkdtempSync(join(modules, "barq-site-guides-"));
  try {
    const server = await half(workspace, slug, true);
    const client = await half(workspace, slug, false);
    const result = renderAndHydrate({ server, client });
    flush();
    return result;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}
