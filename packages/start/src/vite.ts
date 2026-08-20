/**
 * The build half: discover server functions, mount them, and answer their URL
 * in dev.
 *
 * The compiler already decides what a module's exports are and synthesizes the
 * client half. What is missing without this is the other side of the same fact —
 * the server needs one `mount(id, fn)` per exported server function, and the id
 * has to be the same string on both sides or a call reaches nothing.
 *
 * So the ids come from ONE place: the compiler's `serverFns` artefact, taken on
 * a callback and replayed into a generated module the server imports. Deriving
 * them twice, once per side, is how the two halves drift.
 *
 * Environment-API throughout, following `@tanstack/start-plugin-core`: which
 * half a module is compiled for is `this.environment.name`, the manifest exists
 * only in the server environment (`applyToEnvironment`), and a dev request runs
 * through `environment.runner.import` rather than the legacy `ssrLoadModule`.
 */

import { type BarqCompilerOptions, barqVitePlugin } from "@barqjs/compiler/vite";
import { NodeRequest, sendNodeResponse } from "srvx/node";
import { type Plugin, type ViteDevServer, isRunnableDevEnvironment } from "vite";

import { RPC_PREFIX } from "./index.ts";

/**
 * Vite's own environment names. `ssr` for the server one rather than something
 * prettier, because plugins that predate the Environment API still branch on
 * that string — the reason `@tanstack/start-plugin-core` gives for the same
 * choice, naming tailwindcss.
 */
export const ENVIRONMENTS = { client: "client", server: "ssr" } as const;

/** The module a server entry imports to mount everything the build found. */
export const MANIFEST_ID = "virtual:barq-server-fns";
const RESOLVED_MANIFEST_ID = `\0${MANIFEST_ID}`;

interface Discovered {
  /** Absolute module id, as Vite spells it. */
  file: string;
  /** Export names that are server functions, in source order. */
  names: string[];
}

export interface BarqStartOptions {
  /**
   * Origins allowed to call a server function beyond the request's own. Passed
   * to the dev handler; a production server passes its own.
   */
  allowedOrigins?: readonly string[];
  /** Forwarded to the compiler plugin this one configures. */
  compiler?: Omit<BarqCompilerOptions, "serverFns" | "onServerFns" | "root">;
}

/**
 * The artefact the compiler emits, as it crosses back.
 *
 * Parsed rather than trusted: it is this plugin's own compiler talking, but a
 * shape mismatch here would mount nothing and look like an app with no server
 * functions, which is the failure that is hardest to notice.
 */
interface ServerFnArtifact {
  version: number;
  module: string;
  exports: Array<{ name: string; serverFn: boolean }>;
}

function namesOf(json: string): string[] | null {
  let parsed: ServerFnArtifact;
  try {
    parsed = JSON.parse(json) as ServerFnArtifact;
  } catch {
    return null;
  }
  if (parsed.version !== 1 || !Array.isArray(parsed.exports)) return null;
  const names = parsed.exports.filter((e) => e.serverFn).map((e) => e.name);
  return names.length > 0 ? names : null;
}

/**
 * The compiler plugin, the manifest and the dev handler, as one entry.
 *
 * `barqStart()` owns the compiler plugin rather than sitting beside it, because
 * the ids have to come from one place: it turns `serverFns` on and takes the
 * artefact on the callback, so there is no configuration in which the manifest
 * is generated from a different answer than the client stubs were.
 */
export function barqStart(options: BarqStartOptions = {}): Plugin[] {
  const found = new Map<string, Discovered>();
  let root = process.cwd();
  let server: ViteDevServer | null = null;

  /**
   * `<project-relative module>#<export>`, byte for byte what the compiler put
   * in the client stub — pinned by a test that compiles a module and compares
   * the two strings rather than the two rules.
   */
  const idOf = (file: string, name: string): string => {
    const relative = file.startsWith(root) ? file.slice(root.length) : file;
    return `${relative.replace(/^[/\\]+/, "").replaceAll("\\", "/")}#${name}`;
  };

  const record = (id: string, artifact: string): void => {
    const names = namesOf(artifact);
    if (names === null) {
      found.delete(id);
      return;
    }
    found.set(id, { file: id, names });
    // A module that gains or loses a server function has to invalidate the
    // manifest, or the dev server keeps mounting yesterday's set.
    const graph = server?.environments[ENVIRONMENTS.server]?.moduleGraph;
    const module = graph?.getModuleById(RESOLVED_MANIFEST_ID);
    if (module !== undefined && module !== null) graph?.invalidateModule(module);
  };

  const manifest: Plugin = {
    name: "barq-start:manifest",
    // Server-only by construction rather than by a check inside the hook: the
    // manifest imports every server-function module, so resolving it in the
    // client environment would pull all of them into the browser graph.
    applyToEnvironment: (environment) => environment.name !== ENVIRONMENTS.client,
    resolveId(id) {
      return id === MANIFEST_ID ? RESOLVED_MANIFEST_ID : null;
    },
    load(id) {
      return id === RESOLVED_MANIFEST_ID ? manifestModule(found, idOf) : null;
    },
  };

  const dev: Plugin = {
    name: "barq-start:dev",
    // `config` rather than `configResolved`: the environments have to exist
    // before Vite resolves them, and `consumer` is what decides whether a
    // module graph is a browser one.
    config() {
      return {
        environments: {
          [ENVIRONMENTS.client]: { consumer: "client" as const },
          [ENVIRONMENTS.server]: { consumer: "server" as const, build: { ssr: true } },
        },
      };
    },

    configResolved(config) {
      root = config.root;
    },

    configureServer(viteServer) {
      server = viteServer;
      const environment = viteServer.environments[ENVIRONMENTS.server];
      if (!isRunnableDevEnvironment(environment)) {
        throw new Error(
          `[barq-start] the \`${ENVIRONMENTS.server}\` environment is not runnable, so server ` +
            "functions cannot be answered in dev",
        );
      }

      // Before Vite's own middleware: a server-function URL is not a file and
      // not a page, and letting the SPA fallback answer it turns a 404 into an
      // HTML document a client would then try to parse as a value.
      viteServer.middlewares.use((req, res, next) => {
        // Vite rewrites `req.url` to `/index.html` on the way through; the
        // original is the one the id lives in.
        const original = (req as { originalUrl?: string }).originalUrl;
        if (original !== undefined) req.url = original;
        if (!(req.url ?? "").startsWith(RPC_PREFIX)) {
          next();
          return;
        }
        void (async () => {
          try {
            // Through the module runner, so a server function edited on disk is
            // the one that answers the next call.
            const start = (await environment.runner.import(
              "@barqjs/start/server",
            )) as typeof import("./server.ts");
            await environment.runner.import(MANIFEST_ID);

            const response = await start.handleServerFn(new NodeRequest({ req, res }), options);
            if (response === null) {
              next();
              return;
            }
            await sendNodeResponse(res, response);
          } catch (error) {
            try {
              viteServer.ssrFixStacktrace(error as Error);
            } catch {
              // A stack this cannot map is still an error worth reporting.
            }
            next(error);
          }
        })();
      });
    },
  };

  return [
    barqVitePlugin({
      // `.ts` and `.js` are in the set because a server-function module is
      // normally one of them — it holds no JSX, which is exactly why the
      // compiler's own default (`.tsx`, `.jsx`) does not reach it. Without this
      // the client half of `users.ts` is never synthesized and its handler
      // bodies ship, silently, because nothing transformed the module at all.
      //
      // A module with no JSX and no server function passes through unchanged,
      // so the cost is one parse.
      include: [".tsx", ".jsx", ".ts", ".js"],
      ...options.compiler,
      serverFns: true,
      onServerFns: record,
    }),
    manifest,
    dev,
  ];
}

function manifestModule(
  found: Map<string, Discovered>,
  idOf: (file: string, name: string) => string,
): string {
  const lines: string[] = [`import { mount } from "@barqjs/start/server";`];
  let index = 0;
  for (const { file, names } of found.values()) {
    const alias = `m${index++}`;
    lines.push(`import * as ${alias} from ${JSON.stringify(file)};`);
    for (const name of names) {
      lines.push(`mount(${JSON.stringify(idOf(file, name))}, ${alias}.${name});`);
    }
  }
  // An empty manifest is a module, not an error: an app with no server
  // functions still imports this and still has to load.
  lines.push("export {};");
  return lines.join("\n");
}
