/**
 * Another plugin owns the `ssr` environment, the way `@cloudflare/vite-plugin`
 * and Nitro do.
 *
 * The stub replaces the environment with one that has no runner in this
 * process, and answers requests itself through a module runner of its own
 * over the `index` input, as a host's worker would. barq stands its dev
 * middleware down instead of refusing to start, and the app is served through
 * the host. In a build, a host that orchestrates its own `buildApp` builds the
 * server, and barq builds the client first and leaves the server to it.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { type Server, createServer as createHttpServer } from "node:http";
import { join } from "node:path";
import { NodeRequest, sendNodeResponse } from "srvx/node";
import {
  DevEnvironment,
  type Plugin,
  createBuilder,
  createServer,
  createServerHotChannel,
  createServerModuleRunner,
} from "vite";

import { ASSET_MANIFEST_FILE } from "@barqjs/start/serve";

import barq from "../src/index.ts";
import { PORTS, cleanUp, project } from "./project.ts";

afterAll(cleanUp);

function stubHost(answered: string[]): Plugin {
  return {
    name: "stub-host",
    config() {
      return {
        environments: {
          ssr: {
            dev: {
              createEnvironment: (name, config) =>
                new DevEnvironment(name, config, {
                  hot: false,
                  transport: createServerHotChannel(),
                }),
            },
          },
        },
      };
    },
    configureServer(server) {
      return () => {
        const environment = server.environments.ssr;
        const runner = createServerModuleRunner(environment, { hmr: false });
        const input = environment.config.build.rollupOptions.input as Record<string, string>;
        server.middlewares.use((req, res, next) => {
          void (async () => {
            try {
              const service = (await runner.import(input.index)) as {
                default: { fetch(request: Request): Promise<Response> };
              };
              answered.push(req.url ?? "");
              await sendNodeResponse(
                res,
                await service.default.fetch(new NodeRequest({ req, res })),
              );
            } catch (error) {
              next(error);
            }
          })();
        });
      };
    },
  };
}

describe("a host that owns the ssr environment", () => {
  test("in dev, barq stands down and the host serves the app through `index`", async () => {
    const root = project("full-stack");
    const answered: string[] = [];
    const messages: string[] = [];
    const server = await createServer({
      root,
      configFile: false,
      customLogger: {
        info: (message) => messages.push(message),
        warn: (message) => messages.push(message),
        warnOnce: (message) => messages.push(message),
        error: (message) => messages.push(message),
        clearScreen: () => undefined,
        hasErrorLogged: () => false,
        hasWarned: false,
      },
      server: { middlewareMode: true, hmr: false },
      plugins: [barq({ ssr: true, start: true }), stubHost(answered)],
    });
    let http: Server | undefined;
    try {
      expect(server.environments.ssr).not.toHaveProperty("runner");
      expect(messages.join("\n")).toContain("Another plugin runs the `ssr` environment");

      http = createHttpServer(server.middlewares);
      await new Promise<void>((done) => http?.listen(PORTS.provider, "127.0.0.1", done));
      const origin = `http://127.0.0.1:${PORTS.provider}`;

      const page = await fetch(`${origin}/about`, { headers: { accept: "text/html" } });
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("Hello from the server.");

      const health = await fetch(`${origin}/api/health`);
      expect(await health.json()).toEqual({ ok: true });

      // The host answered both, which means barq's own middleware did not.
      expect(answered).toEqual(["/about", "/api/health"]);
    } finally {
      http?.closeAllConnections();
      await new Promise<void>((done) => (http === undefined ? done() : http.close(() => done())));
      await server.close();
    }
  }, 60_000);

  test("in a build, the client is built first and the server is left to the host", async () => {
    const root = project("full-stack");
    const order: string[] = [];
    const warnings: string[] = [];
    const host: Plugin = {
      name: "stub-host-build",
      buildApp: {
        order: "post",
        async handler(builder) {
          const ssr = builder.environments.ssr;
          order.push(`host saw client built: ${builder.environments.client?.isBuilt}`);
          if (ssr !== undefined && !ssr.isBuilt) {
            await builder.build(ssr);
            order.push("host built ssr");
          }
        },
      },
    };
    const builder = await createBuilder({
      root,
      configFile: false,
      logLevel: "silent",
      customLogger: {
        info: () => undefined,
        warn: (message) => warnings.push(message),
        warnOnce: (message) => warnings.push(message),
        error: (message) => warnings.push(message),
        clearScreen: () => undefined,
        hasErrorLogged: () => false,
        hasWarned: false,
      },
      plugins: [barq({ ssr: true, start: { prerender: { routes: ["/"] } } }), host],
    });
    await builder.buildApp();

    expect(order).toEqual(["host saw client built: true", "host built ssr"]);
    // Prerendering imports the server bundle barq built, and here it built none.
    expect(warnings.join("\n")).toContain("`prerender`, `verify` and `spa` did not run");
    expect(existsSync(join(root, "dist", "client", ASSET_MANIFEST_FILE))).toBe(true);
  }, 60_000);
});
