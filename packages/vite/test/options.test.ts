/**
 * How `barq()` turns its options into plugins, without running a build.
 *
 * Each hook is called the way Vite calls it, with only what it reads.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

import { SERVER_ENTRY_ID, isProviderOwned } from "@barqjs/start/vite";

import { boundaryModules } from "../src/boundary.ts";
import { consumerOf } from "../src/environment.ts";
import barq, { type BarqOptions } from "../src/index.ts";
import { cleanUp, project } from "./project.ts";

afterAll(cleanUp);

const named = (plugins: readonly Plugin[], name: string): Plugin => {
  const found = plugins.find((plugin) => plugin.name === name);
  if (found === undefined) throw new Error(`no plugin named ${name}`);
  return found;
};

type Hook = (...args: unknown[]) => unknown;
const hook = (plugin: Plugin, name: keyof Plugin): Hook => {
  const value = plugin[name] as Hook | { handler: Hook } | undefined;
  if (value === undefined) throw new Error(`${plugin.name} has no ${name}`);
  return typeof value === "function" ? value : value.handler;
};

const logger = { warn: () => undefined, info: () => undefined };

/** `config` then `configResolved` on `barq:config`, against a project root. */
async function resolveIn(options: BarqOptions, root: string, command = "build"): Promise<Plugin[]> {
  const plugins = await barq(options);
  const config = named(plugins, "barq:config");
  hook(config, "config").call(config, { root }, { command, mode: "production" });
  hook(config, "configResolved").call(config, { root, logger });
  return plugins;
}

/** The conditions `configEnvironment` leaves an environment with. */
async function conditionsFor(
  options: BarqOptions,
  name: "client" | "ssr",
  command: "serve" | "build",
): Promise<{ conditions?: string[]; externalConditions?: string[] }> {
  const plugins = await barq(options);
  const config = named(plugins, "barq:config");
  hook(config, "config").call(config, {}, { command, mode: "development" });
  const environment: { consumer: string; resolve?: { conditions?: string[] } } = {
    consumer: name === "client" ? "client" : "server",
  };
  hook(config, "configEnvironment").call(config, name, environment, {});
  return environment.resolve ?? {};
}

describe("what each shape composes", () => {
  test("`barq()` is the compiler, the markers and the config policy, and no server", async () => {
    const names = (await barq()).map((plugin) => plugin.name);
    expect(names).toContain("barq-compiler");
    expect(names).toContain("barq:boundary-modules");
    expect(names).toContain("barq:config");
    expect(names.some((name) => name.startsWith("barq-start:"))).toBe(false);
    expect(names).not.toContain("barq:env");
  });

  test("`start` adds the server half and typed env, with one compiler between them", async () => {
    const names = (await barq({ start: true })).map((plugin) => plugin.name);
    for (const name of [
      "barq-start:entries",
      "barq-start:manifest",
      "barq-start:dev",
      "barq:env",
    ]) {
      expect(names).toContain(name);
    }
    expect(names.filter((name) => name === "barq-compiler")).toHaveLength(1);
  });

  test("the router runs before the compiler, which lowers the JSX it splits", async () => {
    const names = (await barq({ start: true })).map((plugin) => plugin.name);
    expect(names.indexOf("barq-router")).toBeGreaterThan(-1);
    expect(names.indexOf("barq-router")).toBeLessThan(names.indexOf("barq-compiler"));
  });

  test("`router: false` leaves file routes out", async () => {
    const names = (await barq({ router: false })).map((plugin) => plugin.name);
    expect(names).not.toContain("barq-router");
  });

  test("every plugin is shared across environments, so they hold one closure", async () => {
    for (const plugin of await barq({ ssr: true, start: true })) {
      expect(plugin.sharedDuringBuild, plugin.name).toBe(true);
    }
  });
});

describe("`ssr` has one meaning", () => {
  const serverEntry = async (options: BarqOptions): Promise<string> => {
    const entries = named(await barq(options), "barq-start:entries");
    const resolved = hook(entries, "resolveId").call(entries, SERVER_ENTRY_ID) as string;
    return hook(entries, "load").call(entries, resolved) as string;
  };

  test("with it, the server renders pages", async () => {
    expect(await serverEntry({ ssr: true, start: true })).not.toContain("pages: false");
  });

  test("without it, the server answers functions and routes and renders no page", async () => {
    expect(await serverEntry({ start: true })).toContain("pages: false");
  });

  test("`start.spa` renders a shell on the server and hydrates it, so it needs `ssr`", async () => {
    const config = named(await barq({ start: { spa: { enabled: true } } }), "barq:config");
    expect(() =>
      hook(config, "config").call(config, {}, { command: "build", mode: "production" }),
    ).toThrow("needs `ssr: true`");
  });
});

describe("resolution", () => {
  test("under `vite dev`, both halves resolve the development builds", async () => {
    const client = await conditionsFor({}, "client", "serve");
    const server = await conditionsFor({}, "ssr", "serve");
    expect(client.conditions?.[0]).toBe("development");
    expect(server.conditions?.[0]).toBe("development");
    expect(client.conditions).toContain("browser");
    expect(server.conditions).toContain("node");
    // What Node loads by itself for the server, too.
    expect(server.externalConditions?.[0]).toBe("development");
    expect(client.externalConditions).toBeUndefined();
  });

  test("a build names no `development`", async () => {
    const server = await conditionsFor({}, "ssr", "build");
    expect(server.conditions).not.toContain("development");
    expect(server.externalConditions).toBeUndefined();
  });

  test("`dev: false` serves the production builds under `vite dev`", async () => {
    const client = await conditionsFor({ dev: false }, "client", "serve");
    expect(client.conditions).not.toContain("development");
    expect(client.conditions).not.toContain("development|production");
    expect(client.conditions).toContain("production");
  });

  test("`conditions` reaches the server environment, which a top-level list does not", async () => {
    const server = await conditionsFor({ conditions: ["bun"] }, "ssr", "build");
    expect(server.conditions?.[0]).toBe("bun");
  });

  test("the runtime is deduped to the copy the project can reach", async () => {
    const root = project("minimal");
    const config = named(await barq(), "barq:config");
    const out = hook(config, "config").call(
      config,
      { root },
      { command: "build", mode: "production" },
    ) as {
      resolve: { dedupe: string[] };
    };
    expect(out.resolve.dedupe).toContain("@barqjs/core");
  });
});

describe("file routes", () => {
  test("a project with no routes directory gets no table", async () => {
    const root = project("minimal");
    const plugins = await resolveIn({}, root);
    const router = named(plugins, "barq-router");
    hook(router, "configResolved").call(router, { root, base: "/", command: "build", logger });
    expect(existsSync(join(root, "src", "routeTree.gen.ts"))).toBe(false);
  });

  test("`router: true` without a routes directory is an error, not an empty table", async () => {
    await expect(resolveIn({ router: true }, project("minimal"))).rejects.toThrow(
      "no `src/routes` directory",
    );
  });

  test("`start.verify` without file routes is an error, not a check of nothing", async () => {
    await expect(resolveIn({ start: { verify: true } }, project("minimal"))).rejects.toThrow(
      "no file routes",
    );
  });

  test("with a routes directory both resolve", async () => {
    await resolveIn({ ssr: true, router: true, start: { verify: true } }, project("full-stack"));
  });
});

describe("environments, by consumer", () => {
  test("the consumer decides, and a context with none falls back to the `ssr` flag", () => {
    expect(consumerOf({ name: "worker", config: { consumer: "client" } })).toBe("client");
    expect(consumerOf({ name: "client", config: { consumer: "server" } })).toBe("server");
    expect(consumerOf(undefined, { ssr: true })).toBe("server");
    expect(consumerOf(undefined)).toBe("client");
  });

  test("a server environment with no runner here, or one that dispatches itself, is a host's", () => {
    expect(isProviderOwned({})).toBe(true);
    expect(isProviderOwned({ runner: {}, dispatchFetch: () => undefined })).toBe(true);
    expect(isProviderOwned({ runner: {} })).toBe(false);
  });
});

describe("`server-only` and `client-only`", () => {
  const resolveMarker = (
    id: string,
    consumer: "client" | "server",
    options: { scan?: boolean } = {},
  ): unknown => {
    const plugin = boundaryModules();
    const context = {
      environment: { config: { consumer } },
      error(message: string): never {
        throw new Error(message);
      },
    };
    return hook(plugin, "resolveId").call(context, id, "/app/src/db.ts", options);
  };

  test("`server-only` in the browser bundle fails, naming the importer", () => {
    expect(() => resolveMarker("server-only", "client")).toThrow("/app/src/db.ts");
    expect(resolveMarker("server-only", "server")).toBeString();
  });

  test("`client-only` in the server bundle fails", () => {
    expect(() => resolveMarker("client-only", "server")).toThrow('imports "client-only"');
    expect(resolveMarker("client-only", "client")).toBeString();
  });

  test("the dependency scanner reads the raw graph, so it is never refused", () => {
    expect(resolveMarker("server-only", "client", { scan: true })).toBeString();
  });

  test("anything else is not the plugin's", () => {
    expect(resolveMarker("server-only-ish", "client")).toBeNull();
  });
});
