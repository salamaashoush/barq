/**
 * The build half: ask the compiler for the route table, serve it, invalidate it.
 *
 * The scan, the naming rules, the tree and both emits all live in
 * `compiler-rs`'s `routes.rs`. This file reads no directory, derives no route
 * from a filename and builds no string — so a route table cannot mean two
 * things, and there is no second implementation to drift.
 *
 * What stays here is the WATCHER, which is the one part that cannot move: Vite
 * owns file events, so `routeTree` returns the file list and this registers it.
 *
 * `virtual:barq-routes` is resolved in EVERY environment, unlike
 * `@barqjs/start`'s server-function manifest, which is `applyToEnvironment`-
 * scoped away from the client. The difference is what each imports: the manifest
 * pulls in every server-function module, so resolving it client-side would drag
 * all of them into the browser graph, while the route table pulls in route
 * COMPONENTS, which is exactly where the browser wants them. Scoping this one
 * would leave the client with no routes at all.
 */

import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";

import type { Plugin } from "vite";

export const ROUTES_ID = "virtual:barq-routes";
const RESOLVED_ROUTES_ID = `\0${ROUTES_ID}`;

/** What `compiler-rs` answers with. */
export interface RouteTree {
  /** The module `virtual:barq-routes` resolves to. */
  readonly module: string;
  /** The `.d.ts` to write beside the source. */
  readonly types: string;
  /** Every route file found, project-relative — for the watcher. */
  readonly files: string[];
  /** Every leaf pattern, which is what `BARQ013` checks a `<Link to>` against. */
  readonly patterns: string[];
}

interface Native {
  routeTree(root: string, dir: string): RouteTree;
}

const native = createRequire(import.meta.url)("@barqjs/compiler-rs") as Native;

/** Scan and generate. Exported so a build script can do it without a dev server. */
export function routeTree(root: string, dir: string): RouteTree {
  return native.routeTree(root, dir);
}

export interface BarqRouterOptions {
  /** Where route files live, relative to the Vite root. */
  readonly routesDir?: string;
  /** Where to write the generated `.d.ts`. `false` writes none. */
  readonly types?: string | false;
  /**
   * Told the leaf patterns after every scan.
   *
   * This is how `BARQ013` gets its route set: the compiler plugin needs it as a
   * `routes` option, and it must come from the SAME scan the table was built
   * from or the check is against a different project than the one that shipped.
   */
  readonly onRoutes?: (patterns: readonly string[]) => void;
}

export function barqRouter(options: BarqRouterOptions = {}): Plugin {
  const routesDir = options.routesDir ?? "src/routes";
  let root = process.cwd();
  let tree: RouteTree = { module: "", types: "", files: [], patterns: [] };

  const rescan = (): void => {
    tree = routeTree(root, routesDir);
    options.onRoutes?.(tree.patterns);
    if (options.types === false) return;
    try {
      writeFileSync(join(root, options.types ?? "src/routes.gen.d.ts"), tree.types);
    } catch {
      // A read-only checkout still builds; the types are a convenience.
    }
  };

  return {
    name: "barq-router",

    configResolved(config) {
      root = config.root;
      rescan();
    },

    resolveId(id) {
      return id === ROUTES_ID ? RESOLVED_ROUTES_ID : null;
    },

    load(id) {
      if (id !== RESOLVED_ROUTES_ID) return null;
      // Watched here rather than in `configResolved`, so the dependency is
      // recorded against the module that actually uses it.
      for (const file of tree.files) this.addWatchFile(join(root, file));
      return tree.module;
    },

    configureServer(server) {
      const changed = (path: string): void => {
        if (relative(join(root, routesDir), path).startsWith("..")) return;
        rescan();
        // A route file appearing or vanishing changes the TABLE, and the table
        // is a different module from the file that changed — without this the
        // dev server keeps serving yesterday's routes. `@barqjs/start`'s
        // manifest does the same thing for the same reason.
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
