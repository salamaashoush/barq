/**
 * A component's examples, written by the server and claimed by the client.
 *
 * The suite's loader compiles `.tsx` for the DOM, so importing an example in a
 * test measures one backend. The page ships both lowerings, and an example
 * that numbers its ids differently on each side, or reads `window` while
 * building, fails only where both run. A component's manifest is bundled once
 * per side with the compiler options `vite.config.ts` passes, and each example
 * goes through `renderAndHydrate` on its own so a failure names the example.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { flush } from "@barqjs/core";
import { renderAndHydrate } from "@barqjs/testing";

import { barqPlugin } from "../../blocks/test-setup.ts";
const examples = fileURLToPath(new URL(".", import.meta.url));
// Inside the package rather than the system temp directory: the built module
// imports `@barqjs/server`, and resolution walks up from where the file IS.
const modules = fileURLToPath(new URL("../../../node_modules/", import.meta.url));

interface Framed {
  readonly title?: string;
  readonly page: () => never;
}

/**
 * Each example inside an element, which is where the page puts it.
 *
 * An example whose root is a provider is a range with no element around it,
 * and a hydration root that is a bare range is a shape the page never
 * produces: the preview card is always its parent.
 */
const frame = (slug: string): string =>
  [
    'import { dynamic } from "@barqjs/web";',
    `import { demos } from ${JSON.stringify(join(examples, slug, "index.ts"))};`,
    "export const framed = demos.map((demo) => {",
    "  const Demo = dynamic(() => demo.component);",
    '  return { title: demo.title, page: () => <div data-slot="preview"><Demo /></div> };',
    "});",
    "",
  ].join("\n");

async function half(workspace: string, slug: string, ssr: boolean): Promise<readonly Framed[]> {
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
      `the ${ssr ? "server" : "client"} half of the ${slug} examples did not build`,
    );
  }

  const built = join(workspace, `built-${side}.mjs`);
  writeFileSync(built, await (result.outputs[0] as { text(): Promise<string> }).text());
  return ((await import(built)) as { framed: readonly Framed[] }).framed;
}

/**
 * Every example of `slug`, hydrated, and a line for each one that was not
 * claimed whole. An empty list is the pass.
 *
 * `reuse` is by reference: a tree that looks right and holds rebuilt nodes is
 * the failure this is for.
 */
export async function hydrateExamples(slug: string): Promise<readonly string[]> {
  const workspace = mkdtempSync(join(modules, "barq-site-examples-"));
  try {
    const server = await half(workspace, slug, true);
    const client = await half(workspace, slug, false);
    const failures: string[] = [];

    for (const [at, demo] of client.entries()) {
      const name = demo.title ?? "the first example";
      const written = server[at];
      if (written === undefined) {
        failures.push(`${name}: the server half has no such example`);
        continue;
      }
      const result = renderAndHydrate({ server: written.page, client: demo.page });
      flush();
      if (result.mismatches.length > 0) {
        failures.push(`${name}: ${result.mismatches.map((one) => one.detail).join("; ")}`);
      } else if (result.recovered) {
        failures.push(`${name}: the walk gave up and rebuilt`);
      } else if (result.reuse !== 1) {
        failures.push(`${name}: kept ${result.kept} of ${result.total} server nodes`);
      } else if (result.total === 0) {
        failures.push(`${name}: the server wrote nothing`);
      }
      result.unmount();
    }
    return failures;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}
