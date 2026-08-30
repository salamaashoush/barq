/**
 * Every template is scaffolded, built, typechecked and RUN.
 *
 * A template that only compiles is not a template. This is the gate the CLI was
 * asked to ship with, and it earned itself the first time it ran: on a
 * scaffolded project — which resolves `@barqjs/*` through `dist`, where the
 * workspace resolves through `src` — an SSR route with a loader served its
 * pending fallback forever, because `@barqjs/core` was published as four
 * separate bundles with four copies of the reactive runtime in them. Nothing in
 * the repo could see it: `bun` resolution never leaves `src/`.
 *
 * So this goes through `scaffold()`, the same function `bun create barq` calls,
 * and then through the project's own `vite build` and `tsc` with `dist` on the
 * resolution path. What it does NOT reproduce is `npm install`: the workspace
 * packages are symlinked, because a gate that reaches the network is a gate
 * that fails for reasons that are not the code's.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { scaffold } from "../src/scaffold.ts";
import { TEMPLATES, type Template } from "../src/templates.ts";

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const PACKAGES = join(REPO, "packages");
const OWN_MODULES = fileURLToPath(new URL("../node_modules", import.meta.url));

/**
 * Everything a template can name, whether or not this one does — plus what the
 * FRAMEWORK names on a template's behalf. `@barqjs/start`'s generated server
 * entry imports `collectCss` from `@barqjs/css`, so a project that never writes
 * a `css` block still resolves it.
 */
const WORKSPACE = ["core", "css", "router", "server", "start", "compiler", "compiler-rs", "extra"];

/** Built once for the whole file: a template resolves `@barqjs/*` through it. */
function ensureBuilt(): void {
  for (const name of WORKSPACE) {
    const directory = join(PACKAGES, name);
    // `compiler-rs` is a native addon with no `dist`; it is built by cargo.
    if (name === "compiler-rs" || existsSync(join(directory, "dist"))) continue;
    const built = Bun.spawnSync({ cmd: ["bun", "run", "build"], cwd: directory });
    if (built.exitCode !== 0) {
      throw new Error(`packages/${name} failed to build:\n${built.stderr.toString()}`);
    }
  }
}

/**
 * `node_modules`, by symlink.
 *
 * Node and bun both resolve a package through its realpath, so a link to
 * `packages/router` resolves `@barqjs/router/vite` through that package's own
 * `exports` — `import` to `dist`, which is what a published install gives and
 * what the workspace's `bun` condition hides.
 */
function link(target: string): void {
  const modules = join(target, "node_modules");
  mkdirSync(join(modules, "@barqjs"), { recursive: true });
  for (const name of WORKSPACE) {
    symlinkSync(join(PACKAGES, name), join(modules, "@barqjs", name));
  }
  for (const name of ["vite", "typescript", "@types", ".bin"]) {
    const source = join(OWN_MODULES, name);
    if (existsSync(source)) symlinkSync(source, join(modules, name));
  }
}

interface Built {
  readonly directory: string;
  readonly template: Template;
}

const built = new Map<string, Built>();
let workspace = "";

beforeAll(() => {
  ensureBuilt();
  workspace = mkdtempSync(join(tmpdir(), "create-barq-"));
  for (const template of TEMPLATES) {
    const directory = join(workspace, template.name);
    scaffold({
      template: template.name,
      target: directory,
      packageName: `barq-${template.name}`,
    });
    link(directory);
    built.set(template.name, { directory, template });
  }
}, 120_000);

afterAll(() => {
  if (workspace !== "") rmSync(workspace, { recursive: true, force: true });
});

function run(directory: string, cmd: readonly string[]): { code: number; output: string } {
  const result = Bun.spawnSync({ cmd: [...cmd], cwd: directory, env: { ...process.env } });
  return {
    code: result.exitCode,
    output: `${result.stdout.toString()}\n${result.stderr.toString()}`,
  };
}

describe.each(TEMPLATES.map((template) => [template.name, template] as const))(
  "the %s template",
  (name, template) => {
    test("builds", () => {
      const { directory } = built.get(name)!;
      const result = run(directory, ["node", "node_modules/.bin/vite", "build"]);
      expect(result.code, result.output).toBe(0);
      expect(existsSync(join(directory, template.clientOut))).toBe(true);
    }, 120_000);

    test("typechecks", () => {
      const { directory } = built.get(name)!;
      // AFTER the build, because `src/routeTree.gen.ts` is written by it and
      // the project imports the file by path like any other module.
      const result = run(directory, ["node", "node_modules/.bin/tsc", "--noEmit"]);
      expect(result.code, result.output).toBe(0);
    }, 120_000);

    test.if(template.prerenders)("writes a static page", () => {
      const { directory } = built.get(name)!;
      const home = join(directory, template.clientOut, "index.html");
      expect(existsSync(home)).toBe(true);
      // The prerendered document, not a Vite `index.html`: it carries the page's
      // own markup, which only a render produces.
      expect(readFileSync(home, "utf8")).toContain("<h1>barq</h1>");
    });

    test.if(template.spa)("builds the document it declares", () => {
      const { directory } = built.get(name)!;
      const home = join(directory, template.clientOut, "index.html");
      expect(existsSync(home)).toBe(true);
      // The `<script>` the BUILD wrote, resolved back to a file it emitted. The
      // source `index.html` names `/src/main.tsx`, so a document that still
      // names it is one the bundler never saw.
      const entry = /<script[^>]+src="([^"]+)"/.exec(readFileSync(home, "utf8"))?.[1];
      expect(entry, "the built document names no module").toBeDefined();
      expect(existsSync(join(directory, template.clientOut, (entry as string).slice(1)))).toBe(
        true,
      );
    });

    test.if(template.server)(
      "serves what it built",
      async () => {
        const { directory } = built.get(name)!;
        const port = 3400 + TEMPLATES.findIndex((one) => one.name === name);
        const server = Bun.spawn({
          cmd: ["bun", join(directory, "dist", "server", "serve.js")],
          cwd: directory,
          env: { ...process.env, PORT: String(port) },
          stdout: "pipe",
          stderr: "pipe",
        });
        try {
          const base = `http://localhost:${port}`;
          await waitFor(base);
          const home = await fetch(`${base}/`, { headers: { accept: "text/html" } });
          expect(home.status).toBe(200);
          // An SPA's document carries the mount point and no markup — the page
          // is rendered in the browser, which is the whole difference.
          expect(await home.text()).toContain(template.spa ? '<div id="app">' : "<h1>barq</h1>");

          const about = await fetch(`${base}/about`, { headers: { accept: "text/html" } });
          expect(about.status).toBe(200);

          // A path no route claims. An SPA answers its document — every route it
          // has is a path the build did not write — and a server-rendered app
          // answers the miss, which is the one thing `preview.mjs` used to get
          // wrong by serving a prerendered 404 as a 200.
          const missing = await fetch(`${base}/nothing-here`, {
            headers: { accept: "text/html" },
          });
          expect(missing.status).toBe(template.spa ? 200 : 404);
        } finally {
          server.kill();
          await server.exited;
        }
      },
      60_000,
    );

    test.if(!template.spa && template.server)(
      "answers its API route",
      async () => {
        const { directory } = built.get(name)!;
        const port = 3410 + TEMPLATES.findIndex((one) => one.name === name);
        const server = Bun.spawn({
          cmd: ["bun", join(directory, "dist", "server", "serve.js")],
          cwd: directory,
          env: { ...process.env, PORT: String(port) },
          stdout: "pipe",
          stderr: "pipe",
        });
        try {
          const base = `http://localhost:${port}`;
          await waitFor(base);
          const health = await fetch(`${base}/api/health`);
          expect(health.status).toBe(200);
          expect(await health.json()).toEqual({ ok: true });

          // The loader's server function ran ON THE SERVER and its value is in
          // the markup. This is the assertion that caught the duplicated core
          // runtime: the page rendered, and the value was never there.
          const about = await fetch(`${base}/about`, { headers: { accept: "text/html" } });
          expect(await about.text()).toContain("Hello from the server.");
        } finally {
          server.kill();
          await server.exited;
        }
      },
      60_000,
    );
  },
);

async function waitFor(base: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(base, { headers: { accept: "text/html" } });
      return;
    } catch {
      await Bun.sleep(100);
    }
  }
  throw new Error(`${base} never came up`);
}

/**
 * The templates cannot drift from the packages they install.
 *
 * A template names a published RANGE, not `workspace:*` — it is copied out of
 * this repo into somebody else's directory. So the ranges are checked against
 * the versions in this workspace, which is the only place they can be wrong
 * without anybody noticing until a scaffolded project installs the wrong one.
 */
describe("the templates and the workspace agree", () => {
  const version = (name: string): string =>
    (JSON.parse(readFileSync(join(PACKAGES, name, "package.json"), "utf8")) as { version: string })
      .version;

  test.each(TEMPLATES.map((template) => template.name))(
    "%s names the versions this repo publishes",
    (name) => {
      const manifest = JSON.parse(
        readFileSync(
          join(fileURLToPath(new URL("../templates", import.meta.url)), name, "package.json"),
          "utf8",
        ),
      ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

      const wrong: string[] = [];
      for (const group of [manifest.dependencies, manifest.devDependencies]) {
        for (const [dependency, range] of Object.entries(group ?? {})) {
          if (!dependency.startsWith("@barqjs/")) continue;
          const expected = `^${version(dependency.slice("@barqjs/".length))}`;
          if (range !== expected) wrong.push(`${dependency}: ${range} should be ${expected}`);
        }
      }
      expect(wrong).toEqual([]);
    },
  );

  test.each(TEMPLATES.map((template) => template.name))("%s emits nothing generated", (name) => {
    const directory = join(fileURLToPath(new URL("../templates", import.meta.url)), name);
    // `routeTree.gen.ts` is written by `barqRouter` and committed by the
    // project, TanStack's arrangement. A template that shipped one would ship a
    // stale table; a template that gitignored it would hide a file people read.
    expect(existsSync(join(directory, "src", "routeTree.gen.ts"))).toBe(false);
    // The virtual-module declarations live in `packages/router` now. A project
    // that writes its own has one that goes stale against the package.
    expect(existsSync(join(directory, "src", "virtual.d.ts"))).toBe(false);
    const ignored = readFileSync(join(directory, "_gitignore"), "utf8");
    expect(ignored).not.toContain("routeTree");
  });
});
