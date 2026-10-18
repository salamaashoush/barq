import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  type Plugin,
  type UserConfig,
  defaultClientConditions,
  defaultExternalConditions,
  defaultServerConditions,
} from "vite";

import { boundaryModules } from "./boundary.ts";
import {
  BARQ_CONDITION,
  type BarqVitePluginOptions,
  barqVitePlugin,
  packageDir,
} from "./compiler.ts";
import { startEnv } from "./env.ts";
import type { Reachability } from "./reachability.ts";
import { type BarqRouterOptions, barqRouter } from "./router.ts";
import type { BarqStartOptions } from "./start.ts";

export { CLIENT_ENV_ID, ENV_TYPES_FILE, SERVER_ENV_ID } from "./env.ts";
export type { BarqRenderer } from "./compiler.ts";

/** What `compiler` passes through; the rest is decided from the options around it. */
export type CompilerOptions = Omit<
  BarqVitePluginOptions,
  "hydratable" | "routes" | "serverFns" | "onServerFns" | "root" | "dev" | "hmr" | "env"
> & {
  /**
   * Route patterns BARQ013 accepts beside the file routes, for a router the
   * application mounts with a table of its own.
   */
  readonly routes?: readonly string[];
};

export interface RouterOptions {
  /** Where route files live, relative to the Vite root. `src/routes` when omitted. */
  readonly routesDir?: string;
  /** Where the generated table is written. `false` writes none. */
  readonly routeTree?: string | false;
  /** Move each route's components into a chunk of their own. On by default. */
  readonly codeSplitting?: boolean;
}

export type StartOptions = Omit<BarqStartOptions, "compiler" | "pages" | "routeTree" | "verify"> & {
  /**
   * Fail the build when a route reaches a server function that does not carry
   * that route's declared middleware. Needs file routes, since the routes are
   * what declare the middleware.
   */
  readonly verify?: boolean | { readonly onViolation?: "error" | "warn" };
  /**
   * Typed environment variables from `env.ts` at the project root, or from
   * the file named here. Probed when omitted; `false` turns it off.
   */
  readonly env?: boolean | string;
};

export interface BarqOptions {
  /**
   * Whether pages are rendered on the server, with one meaning everywhere:
   * the server renders the document and the client hydrates it, so both
   * halves compile hydratable. With `start` it also turns the page handler on.
   * Off is a client-rendered app, whose document is `index.html`.
   * @default false
   */
  readonly ssr?: boolean;
  /**
   * The server half: server functions, route handlers, the dev server's page
   * and function middleware, `vite preview`, and a `vite build` that builds the
   * client and then the server. `true` is `{}`.
   */
  readonly start?: boolean | StartOptions;
  /**
   * File routes: the route table generated from `src/routes`, route code
   * splitting, and BARQ013's route set. On when the routes directory exists
   * and `@barqjs/router` is installed; `true` requires both.
   */
  readonly router?: boolean | RouterOptions;
  /**
   * Resolve the development builds under `vite dev`, and compile with the
   * dev-only diagnostics. No effect on `vite build`.
   * @default true
   */
  readonly dev?: boolean;
  /** Replacing an edited component in place under `vite dev`. */
  readonly refresh?: { readonly disabled?: boolean };
  /**
   * Export conditions every environment resolves first, client and server
   * alike. Vite applies a top-level `resolve.conditions` to the client
   * environment only, and a condition that picks a package's build has to
   * reach both halves or the app loads two copies of it.
   */
  readonly conditions?: readonly string[];
  /** Options for the barq compiler. */
  readonly compiler?: CompilerOptions;
}

/**
 * What the router reports and the compiler and the build read.
 *
 * In this closure rather than in the application's config, because Vite
 * re-evaluates the config for each environment it builds and a module-scope
 * variable there is a different variable each time. Every plugin here is
 * shared across environments, so they all hold this one object.
 */
interface Shared {
  routes: readonly string[] | undefined;
  reachability: Reachability | undefined;
}

const RUNTIME_PACKAGES = ["@barqjs/core", "@barqjs/web", "@solidjs/signals"];

function installed(name: string): boolean {
  try {
    import.meta.resolve(name);
    return true;
  } catch {
    return false;
  }
}

async function optionalPackage<T>(
  load: () => Promise<T>,
  name: string,
  required: string,
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    const code = (error as { code?: string }).code;
    const missing =
      (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") &&
      (error as Error).message.includes(name);
    if (!missing) throw error;
    throw new Error(`[barq] ${required} needs \`${name}\`, which is not installed.`, {
      cause: error,
    });
  }
}

/**
 * Resolution and reload policy for every environment.
 *
 * `development` is named rather than left to Vite's `development|production`,
 * which `dev: false` maps to `production`, and it goes into the server
 * environments' `externalConditions` too: a dependency Node loads by itself
 * otherwise runs its production build beside the development one the inlined
 * code imports.
 */
function configPlugin(
  options: BarqOptions,
  onRoot: (root: string) => void,
  routerOn: () => boolean,
): Plugin {
  const start = options.start === undefined || options.start === false ? null : options.start;
  let serving = false;
  return {
    name: "barq:config",
    enforce: "pre",
    sharedDuringBuild: true,
    config(user: UserConfig, env) {
      serving = env.command === "serve" && env.isPreview !== true;
      if (start !== null && start !== true && start.spa?.enabled === true && options.ssr !== true) {
        throw new Error(
          "[barq] `start.spa` renders the root route's shell on the server and hydrates it, so it needs `ssr: true`.",
        );
      }
      const root = resolve(user.root ?? process.cwd());
      return {
        resolve: { dedupe: RUNTIME_PACKAGES.filter((name) => packageDir(root, name) !== null) },
      };
    },
    configEnvironment(name, config, environment) {
      config.resolve ??= {};
      const client =
        config.consumer === "client" ||
        (config.consumer === undefined && name === "client") ||
        environment.isSsrTargetWebworker === true;
      const defaults = client ? defaultClientConditions : defaultServerConditions;
      const own = config.resolve.conditions ?? [...defaults];
      const development = serving && options.dev !== false;
      config.resolve.conditions = [
        ...(options.compiler?.compilePackages === false ? [] : [BARQ_CONDITION]),
        ...(options.conditions ?? []),
        ...(development ? ["development"] : []),
        // A server render inside a worker runtime still resolves the browser
        // builds of its dependencies, and `worker` ahead of them picks the
        // server half of a package that ships one, such as `@barqjs/web`'s
        // `isServer`.
        ...(environment.isSsrTargetWebworker === true ? ["worker"] : []),
        ...(serving && options.dev === false
          ? own.map((condition) =>
              condition === "development|production" ? "production" : condition,
            )
          : own),
      ];
      if (development && !client) {
        config.resolve.externalConditions = [
          "development",
          ...(config.resolve.externalConditions ?? defaultExternalConditions),
        ];
      }
    },
    configResolved(config) {
      onRoot(config.root);
      const routesDir =
        typeof options.router === "object"
          ? (options.router.routesDir ?? "src/routes")
          : "src/routes";
      if (options.router === true && !routerOn()) {
        throw new Error(
          `[barq] \`router: true\` and there is no \`${routesDir}\` directory to generate a route table from.`,
        );
      }
      const verify = start !== null && start !== true && start.verify !== undefined;
      if (verify && start.verify !== false && !routerOn()) {
        throw new Error(
          "[barq] `start.verify` checks each route's middleware, and this project has no file routes. " +
            `Add routes under \`${routesDir}\`, or drop \`verify\`.`,
        );
      }
      if (start !== null && options.ssr !== true && !existsSync(join(config.root, "index.html"))) {
        const entry = [".tsx", ".ts", ".jsx", ".js"].some((extension) =>
          existsSync(join(config.root, "src", `entry-client${extension}`)),
        );
        if (!entry) {
          config.logger.warn(
            "[barq] `start` without `ssr` renders no pages, and this project has no `index.html` to be its document. " +
              "Add `index.html`, or set `ssr: true` to render pages on the server.",
          );
        }
      }
    },
  };
}

/**
 * barq's Vite plugin: the compiler, file routes and the server half, from one
 * call, under the option names Solid's `@solidjs/vite-plugin` uses where the
 * concept is the same.
 *
 * ```ts
 * plugins: [barq({ ssr: true, start: { prerender: { routes: ["/"] } } })]
 * ```
 */
export default async function barq(options: BarqOptions = {}): Promise<Plugin[]> {
  const shared: Shared = { routes: undefined, reachability: undefined };
  const startOptions: StartOptions | null =
    options.start === undefined || options.start === false
      ? null
      : options.start === true
        ? {}
        : options.start;
  const routerOptions: RouterOptions | null =
    options.router === false
      ? null
      : options.router === true || options.router === undefined
        ? {}
        : options.router;
  const routesDir = routerOptions?.routesDir ?? "src/routes";
  const hmr = options.refresh?.disabled !== true;

  const routerInstalled = routerOptions !== null && installed("@barqjs/router");
  if (options.router !== undefined && routerOptions !== null && !routerInstalled) {
    throw new Error("[barq] `router` needs `@barqjs/router`, which is not installed.");
  }
  const startModule =
    startOptions === null
      ? null
      : await optionalPackage(() => import("./start.ts"), "@barqjs/start", "`start`");

  let root = process.cwd();
  const routerOn = (): boolean => routerInstalled && existsSync(join(root, routesDir));

  const { routes: extraRoutes, ...compilerOptions } = options.compiler ?? {};
  const routes = (): readonly string[] | undefined =>
    shared.routes === undefined && extraRoutes === undefined
      ? undefined
      : [...(shared.routes ?? []), ...(extraRoutes ?? [])];
  const compiler = {
    ...compilerOptions,
    hydratable: options.ssr === true,
    routes,
    ...(options.dev === false ? { dev: false } : {}),
    hmr,
  };

  const plugins: Plugin[] = [
    configPlugin(options, (resolved) => (root = resolved), routerOn),
    boundaryModules(),
  ];

  if (routerInstalled && routerOptions !== null) {
    const router: BarqRouterOptions = {
      ...routerOptions,
      ...(compilerOptions.coreSource === undefined
        ? {}
        : { coreSource: compilerOptions.coreSource }),
      hmr,
      onRoutes: (patterns) => (shared.routes = patterns),
      onReachability: (found) => (shared.reachability = found),
    };
    plugins.push(barqRouter(router));
  }

  if (startModule !== null && startOptions !== null) {
    const { verify, env, ...rest } = startOptions;
    const routeTree =
      routerOptions !== null && typeof routerOptions.routeTree === "string"
        ? routerOptions.routeTree
        : undefined;
    plugins.push(
      ...startEnv(env),
      ...startModule.barqStart({
        ...rest,
        compiler,
        pages: options.ssr === true,
        ...(routeTree === undefined ? {} : { routeTree }),
        ...(verify === undefined || verify === false
          ? {}
          : {
              verify: {
                reachability: () => shared.reachability,
                onViolation: verify === true ? "error" : (verify.onViolation ?? "error"),
              },
            }),
      }),
    );
  } else {
    plugins.push({ ...barqVitePlugin(compiler), sharedDuringBuild: true });
  }

  return plugins;
}
