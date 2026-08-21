/**
 * The build half: discover route files, emit the table, write the types.
 *
 * `virtual:barq-routes` is resolved in EVERY environment, unlike
 * `@barqjs/start`'s server-function manifest which is `applyToEnvironment`-
 * scoped away from the client. The difference is what each one imports: the
 * manifest pulls in every server-function module, so resolving it client-side
 * would drag all of them into the browser graph, while the route table pulls in
 * route components, which the browser is exactly where they belong. Scoping this
 * one would leave the client with no routes at all.
 *
 * The generated module imports nothing eagerly — every route is a `lazy()` over
 * a dynamic `import()`, so a route is its own chunk by construction rather than
 * by a bundler heuristic.
 */

import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

import type { Plugin } from "vite";

import { type RouteFile, buildTree, generateModule, generateTypes, nameOf } from "./generate.ts";

export const ROUTES_ID = "virtual:barq-routes";
const RESOLVED_ROUTES_ID = `\0${ROUTES_ID}`;

export interface BarqRouterOptions {
  /** Where route files live, relative to the Vite root. */
  readonly routesDir?: string;
  /** Where to write the generated `.d.ts`. `false` writes none. */
  readonly types?: string | false;
  readonly extensions?: readonly string[];
}

const DEFAULT_EXTENSIONS = [".tsx", ".jsx", ".ts", ".js"];

/** Every route file under `dir`, project-relative and POSIX-separated. */
export function discover(
  root: string,
  dir: string,
  extensions: readonly string[] = DEFAULT_EXTENSIONS,
): RouteFile[] {
  const absolute = join(root, dir);
  const out: RouteFile[] = [];

  const walk = (current: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      // A project with no routes directory yet is not an error: the generated
      // module is an empty table and the dev server still starts.
      return;
    }
    for (const entry of entries.toSorted()) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!extensions.some((extension) => entry.endsWith(extension))) continue;
      // A test or a story beside a route is not a route.
      if (/\.(test|spec|stories)\./.test(entry)) continue;

      const fromRoot = relative(root, path).split(sep).join(posix.sep);
      const fromDir = relative(absolute, path).split(sep).join(posix.sep);
      out.push({ file: fromRoot, name: nameOf(fromDir) });
    }
  };

  walk(absolute);
  return out;
}

export function barqRouter(options: BarqRouterOptions = {}): Plugin {
  const routesDir = options.routesDir ?? "src/routes";
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  let root = process.cwd();
  let files: RouteFile[] = [];

  const rescan = (): void => {
    files = discover(root, routesDir, extensions);
  };

  const writeTypes = (): void => {
    if (options.types === false) return;
    const target = join(root, options.types ?? "src/routes.gen.d.ts");
    try {
      writeFileSync(target, generateTypes(buildTree(files)));
    } catch {
      // A read-only checkout still builds; the types are a convenience.
    }
  };

  return {
    name: "barq-router",
    // NOT `applyToEnvironment`-scoped. See the header: the route table belongs
    // in the browser graph, unlike the server-function manifest.

    configResolved(config) {
      root = config.root;
      rescan();
      writeTypes();
    },

    resolveId(id) {
      return id === ROUTES_ID ? RESOLVED_ROUTES_ID : null;
    },

    load(id) {
      if (id !== RESOLVED_ROUTES_ID) return null;
      // Watched here rather than in `configResolved`, so the dependency is
      // recorded against the module that actually uses it.
      for (const file of files) this.addWatchFile(join(root, file.file));
      return generateModule(buildTree(files), "@barqjs/router");
    },

    configureServer(server) {
      const changed = (path: string): void => {
        const inside = relative(join(root, routesDir), path);
        if (inside.startsWith("..")) return;
        rescan();
        writeTypes();
        // A route file appearing or vanishing changes the TABLE, and the table
        // is a different module from the file — without this the dev server
        // keeps serving yesterday's routes. `@barqjs/start`'s manifest does the
        // same thing for the same reason.
        for (const environment of Object.values(server.environments)) {
          const module = environment.moduleGraph.getModuleById(RESOLVED_ROUTES_ID);
          if (module !== undefined && module !== null) {
            environment.moduleGraph.invalidateModule(module);
          }
        }
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", changed);
      server.watcher.on("unlink", changed);
    },
  };
}
