/**
 * arc's components through the string backend, for the suites that need to
 * know what a server writes.
 *
 * A fixture is BUNDLED rather than imported: this suite's loader compiles
 * `.tsx` for the DOM, so importing a component here would measure the DOM
 * backend under a server renderer. The runtime packages and the router stay
 * external, so a bundle and the process running it share one scheduler and
 * one router context.
 */

import { afterAll } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { cssRegistration } from "@barqjs/vite/internal";

const require_ = createRequire(import.meta.url);

interface NativeCompiler {
  transform(code: string, options?: Record<string, unknown>): Transformed;
}

interface Transformed {
  code: string;
  css?: string;
}
const native = require_("@barqjs/compiler") as NativeCompiler;

const EXTERNAL = [
  "@barqjs/core",
  "@barqjs/web",
  "@barqjs/css",
  "@barqjs/server",
  "@barqjs/router",
  "@barqjs/router/server",
];

interface LoadHook {
  onLoad(filter: LoadFilter, load: (args: LoadArgs) => Loaded): void;
}

interface LoadFilter {
  filter: RegExp;
}

interface LoadArgs {
  path: string;
}

interface Loaded {
  contents: string;
  loader: "ts" | "tsx";
}

function plugin(ssr: boolean) {
  return {
    name: ssr ? "arc-ssr" : "arc-dom",
    setup(build: LoadHook) {
      build.onLoad({ filter: /\.tsx?$/ }, (args) => {
        const result = native.transform(readFileSync(args.path, "utf8"), {
          filename: args.path,
          ssr,
          hydratable: true,
          strictCss: true,
        });
        const contents =
          result.css === undefined || result.css === ""
            ? result.code
            : result.code + cssRegistration(args.path, result.css);
        return { contents, loader: args.path.endsWith(".tsx") ? "tsx" : "ts" } as const;
      });
    },
  };
}

const root = fileURLToPath(new URL("./index.ts", import.meta.url));
// Inside the package, so the built module resolves the externals from here.
// Made on first use, and again after a suite's `afterAll` removed it: this
// module is shared by every suite in the process.
let made: string | undefined;
function workspace(): string {
  if (made === undefined || !existsSync(made)) {
    made = mkdtempSync(
      join(fileURLToPath(new URL("../node_modules/", import.meta.url)), "barq-arc-ssr-"),
    );
  }
  return made;
}

afterAll(() => {
  if (made !== undefined) rmSync(made, { recursive: true, force: true });
});

let probes = 0;

interface BuildOutput {
  text(): Promise<string>;
}

async function bundle(source: string, ssr: boolean): Promise<string> {
  const id = probes++;
  const entry = join(workspace(), `probe${String(id)}.tsx`);
  writeFileSync(entry, source.replaceAll("<arc>", root));
  const result = await Bun.build({
    entrypoints: [entry],
    target: "bun",
    format: "esm",
    plugins: [plugin(ssr)],
    external: EXTERNAL,
  });
  if (!result.success) throw new AggregateError(result.logs, "the fixture did not build");
  const file = join(workspace(), `built${String(id)}-${ssr ? "ssr" : "dom"}.mjs`);
  writeFileSync(file, await (result.outputs[0] as BuildOutput).text());
  return file;
}

export interface Halves {
  server: () => never;
  client: () => never;
}

interface PageModule {
  Page: () => never;
}

/** A module exporting `Page`, compiled for each backend: the two halves of a hydration. */
export async function halves(source: string): Promise<Halves> {
  const server = (await import(await bundle(source, true))) as PageModule;
  const client = (await import(await bundle(source, false))) as PageModule;
  return { server: server.Page, client: client.Page };
}

export interface ServerRun {
  code: number;
  html: string;
  errors: string;
}

/**
 * A module exporting `async page(): Promise<string>`, run in a process with no
 * DOM, which is what a server is: in this one happy-dom gives every module a
 * `document` and `isServer` is false.
 */
export async function serverProcess(source: string): Promise<ServerRun> {
  const built = await bundle(source, true);
  const runner = join(workspace(), `run${String(probes++)}.mjs`);
  // The page is done when `page()` resolves, so the process exits there rather
  // than when its event loop drains. A form keeps one alive for five seconds:
  // `@tanstack/form-core` announces each form to TanStack's devtools and, with
  // no bus to answer, retries once a second five times.
  writeFileSync(
    runner,
    [
      `import { page } from ${JSON.stringify(built)};`,
      "const html = await page();",
      "await Bun.write(Bun.stdout, html);",
      "process.exit(0);",
      "",
    ].join("\n"),
  );
  const child = Bun.spawn(["bun", runner], { cwd: workspace(), stdout: "pipe", stderr: "pipe" });
  const [code, html, errors] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, html, errors };
}
