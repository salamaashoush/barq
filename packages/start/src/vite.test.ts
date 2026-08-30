import { describe, expect, test } from "bun:test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { transform } from "@barqjs/compiler-rs";

import {
  CLIENT_ENTRY_ID,
  MANIFEST_ID,
  ROUTER_ENTRY_ID,
  SERVER_ENTRY_ID,
  SERVE_ENTRY_ID,
  barqStart,
} from "./vite.ts";

/**
 * The three plugins `barqStart()` returns, as the loose shapes these tests
 * drive them through. Vite's `Plugin` types its hooks as object-or-function, so
 * calling one directly needs the narrower view.
 */
interface Loose {
  configResolved?: (config: unknown) => void;
  config?: (user: unknown, env: unknown) => unknown;
  transform?: (code: string, id: string, options?: { ssr?: boolean }) => { code: string } | null;
  resolveId?: (id: string) => string | null;
  load?: (id: string) => string | null;
}

function byName(
  plugins: ReturnType<typeof barqStart>,
): [
  Required<Pick<Loose, "transform">> & Loose,
  Required<Pick<Loose, "resolveId" | "load">> & Loose,
  Loose,
] {
  const at = (name: string): Loose =>
    plugins.find((plugin) => plugin.name === name) as unknown as Loose;
  return [
    at("barq-compiler") as Required<Pick<Loose, "transform">> & Loose,
    at("barq-start:manifest") as Required<Pick<Loose, "resolveId" | "load">> & Loose,
    at("barq-start:dev"),
  ];
}

const SOURCE =
  `import { createServerFn } from "@barqjs/start";\n` +
  `import { db } from "./db";\n` +
  `export const getUser = createServerFn().handler(async (id) => db.query(id));\n` +
  `const internal = createServerFn().handler(async () => 1);\n` +
  `export const listUsers = createServerFn().handler(async () => db.all());\n`;

const ROOT = "/home/me/app";
const FILE = `${ROOT}/server/users.ts`;

/** The plugin pair, driven the way Vite drives it. */
function drive(): { manifest: string; stubs: string } {
  const [compiler, manifest, dev] = byName(barqStart());

  const config = { root: ROOT, mode: "development" };
  compiler.configResolved?.(config);
  dev.configResolved?.(config);

  // Vite hands the compiler a plugin context; only `warn` is reached here.
  const context = { warn: () => {} };
  const client = compiler.transform.call(context, SOURCE, FILE, { ssr: false });

  const resolved = manifest.resolveId(MANIFEST_ID) as string;
  return { manifest: manifest.load(resolved) as string, stubs: client?.code ?? "" };
}

describe("the manifest", () => {
  /**
   * The property the whole plugin exists for. A client stub calls
   * `<module>#<export>` and the server mounts `<module>#<export>`; if the two
   * strings are derived separately they drift, and a call reaches nothing with
   * no error on either side. So the ids are compared as strings, not as rules.
   */
  test("mounts exactly the ids the client stubs call", () => {
    const { manifest, stubs } = drive();

    const called = [...stubs.matchAll(/clientRpc\("([^"]+)"\)/g)].map((m) => m[1]);
    const mounted = [...manifest.matchAll(/mount\("([^"]+)"/g)].map((m) => m[1]);

    expect(called).toEqual(["server/users.ts#getUser", "server/users.ts#listUsers"]);
    expect(mounted.toSorted()).toEqual(called.toSorted());
  });

  /** Export-ness decides the surface on both sides, not just in the compiler. */
  test("an internal server function is neither stubbed nor mounted", () => {
    const { manifest, stubs } = drive();
    expect(stubs).not.toContain("internal");
    expect(manifest).not.toContain("internal");
  });

  test("the client stubs carry no server code", () => {
    const { stubs } = drive();
    expect(stubs).not.toContain("db.query");
    expect(stubs).not.toContain("./db");
  });

  /**
   * Transforming the same module twice is an EDIT, not a collision.
   *
   * `record` invalidates the manifest whenever a server-function module is
   * transformed, and the dev server re-imports it on the next request. That used
   * to reach `mount`'s duplicate-id refusal — the registry lives in a module
   * nothing invalidates — so every page answered 500 after the first edit. The
   * manifest must generate the same single set however many times the module
   * has been through the compiler.
   */
  test("re-transforming a module does not double-mount it", () => {
    const [compiler, manifest, dev] = byName(barqStart());
    const config = { root: ROOT, mode: "development" };
    compiler.configResolved?.(config);
    dev.configResolved?.(config);

    const context = { warn: () => {} };
    for (let at = 0; at < 3; at++) {
      compiler.transform.call(context, SOURCE, FILE, { ssr: false });
    }

    const code = manifest.load(manifest.resolveId(MANIFEST_ID) as string) as string;
    const mounted = [...code.matchAll(/mount\("([^"]+)"/g)].map((m) => m[1]);
    expect(mounted.toSorted()).toEqual(["server/users.ts#getUser", "server/users.ts#listUsers"]);
  });

  /**
   * A bundler suffix on the module id is the same module.
   *
   * The dependency optimiser hands the client environment `…/users.ts?v=8f1c2a`
   * while the SSR environment sees the bare path. Keyed by the raw id those were
   * two entries producing one `mount()` call twice.
   */
  test("a query on the module id is not a second module", () => {
    const [compiler, manifest, dev] = byName(barqStart());
    const config = { root: ROOT, mode: "development" };
    compiler.configResolved?.(config);
    dev.configResolved?.(config);

    const context = { warn: () => {} };
    compiler.transform.call(context, SOURCE, FILE, { ssr: false });
    compiler.transform.call(context, SOURCE, `${FILE}?v=8f1c2a`, { ssr: false });

    const code = manifest.load(manifest.resolveId(MANIFEST_ID) as string) as string;
    const mounted = [...code.matchAll(/mount\("([^"]+)"/g)].map((m) => m[1]);
    expect(mounted.toSorted()).toEqual(["server/users.ts#getUser", "server/users.ts#listUsers"]);
  });

  /** An app with no server functions still imports this module. */
  test("an empty manifest is a module rather than an error", () => {
    const [, manifest] = byName(barqStart());
    const code = manifest.load(manifest.resolveId(MANIFEST_ID) as string) as string;
    expect(code).toContain("export {}");
    expect(code).not.toContain("mount(");
  });
});

describe("the artifact the manifest is built from", () => {
  /**
   * The plugin re-derives the id rather than carrying the compiler's, so this
   * pins the compiler's own answer to the same rule. If the compiler changes
   * how it spells an id, this fails here rather than at runtime as a 404.
   */
  test("the compiler spells an id the same way the plugin does", () => {
    const out = transform(SOURCE, { filename: FILE, root: ROOT, env: "client", serverFns: true });
    expect(out.code).toContain('clientRpc("server/users.ts#getUser")');

    const artifact = JSON.parse(out.serverFns as string) as {
      exports: Array<{ name: string; serverFn: boolean }>;
    };
    expect(artifact.exports.filter((e) => e.serverFn).map((e) => e.name)).toEqual([
      "getUser",
      "listUsers",
    ]);
  });
});

/**
 * The DEFAULT ENTRIES — what an application gets when it writes none.
 *
 * This is the path with no gate before now, and it went stale unnoticed for
 * exactly that reason: only `packages/kitchen-sink` exercised the current design,
 * because only it wrote its own entries. The generated client half still
 * hydrated `RouterProvider` into `#app` long after the document became JSX, and
 * the generated server half still built the string `document` template the shell
 * replaced. Both are silently wrong rather than loudly wrong — the head simply
 * renders nothing.
 *
 * The override path has its own coverage in `test/dev-server.test.ts`, against a
 * fixture that writes both entries.
 */
const serveEntryWith = (options: Parameters<typeof barqStart>[0]): string => {
  const plugins = barqStart(options) as unknown as (Loose & { name: string })[];
  for (const plugin of plugins) plugin.configResolved?.({ root: ROOT, mode: "development" });
  const found = plugins.find((one) => one.name === "barq-start:entries") as unknown as {
    resolveId: (id: string) => string | null;
    load: (id: string) => string | null;
  };
  return found.load(found.resolveId(SERVE_ENTRY_ID) as string) ?? "";
};

describe("the entries an application does not write", () => {
  const entries = (): {
    resolveId: (id: string) => string | null;
    load: (id: string) => string | null;
  } => {
    const plugins = barqStart() as unknown as (Loose & { name: string })[];
    // EVERY plugin, because `root` is one closure the whole `barqStart()` call
    // shares and whichever plugin declares `configResolved` is the one that
    // fills it in. Driving only the entries plugin left `root` at
    // `process.cwd()`, which is this package rather than the application.
    for (const plugin of plugins) plugin.configResolved?.({ root: ROOT, mode: "development" });
    return plugins.find((one) => one.name === "barq-start:entries") as unknown as {
      resolveId: (id: string) => string | null;
      load: (id: string) => string | null;
    };
  };

  test("the client half boots through `startClient` and names nothing else", () => {
    const plugin = entries();
    const code = plugin.load(plugin.resolveId(CLIENT_ENTRY_ID) as string) ?? "";

    expect(code).toContain('import { startClient } from "@barqjs/router/client"');
    expect(code).toContain("await startClient()");
    // NO ROUTE TREE. It used to pass `routeTree` from `routeTree.gen.ts`, so an
    // application overriding this entry had to import a generated file to hand
    // back a value the framework can reach itself.
    expect(code).not.toContain("routeTree");
    // The boot ORDER is the framework's, so an application never writes it.
    expect(code).not.toContain("createRouter");
    expect(code).not.toContain("preloadMatched");
    // …and never into a container. `shellComponent` renders `<html>`, and
    // hydrating `#app` instead skips `Document`'s `provide`, so `<HeadContent />`
    // reads no assets and renders nothing.
    expect(code).not.toContain("#app");
    expect(code).not.toContain("getElementById");
  });

  test("the server half is `createStartHandler` and serves nothing", () => {
    const plugin = entries();
    const code = plugin.load(plugin.resolveId(SERVER_ENTRY_ID) as string) ?? "";

    expect(code).toContain('import { createStartHandler } from "@barqjs/router/server"');
    expect(code).toContain(
      "export default createStartHandler({ inlineCss: collectCss, requestCss: collectRequestCss })",
    );
    // TWO channels, because they have different lifetimes. `inlineCss` is what
    // the application registered when it was IMPORTED, which every request
    // needs; `requestCss` is what one render registered, which only that
    // request needs. Without the split a server process imported the app once
    // and served forever, so `/about` inlined the rules a request for `/css`
    // had produced.
    expect(code).toContain('import { collectCss, setCssSink } from "@barqjs/css"');
    expect(code).toContain('import { collectRequestCss, installCssSink } from "@barqjs/start"');
    expect(code).toContain("installCssSink(setCssSink);");
    // IT STARTS NOTHING, and that is the property. `vite build` imports this
    // module to prerender and to run the chain check, so a `serve()` here would
    // bind a port in the middle of a build and never return.
    expect(code).not.toContain("serveBarq");
    // The document is `shellComponent` on the root route; `<HeadContent />` and
    // `<Scripts />` place themselves. A template here is a second answer, and it
    // was the one that serialised the head before the body.
    expect(code).not.toContain("<!doctype html>");
    expect(code).not.toContain("document:");
    // `createFetch` and `verifyChains` hang off the DEFAULT export now, built by
    // `createStartHandler`, so the entry declares neither.
    expect(code).not.toContain("export const createFetch");
    expect(code).not.toContain("chainVerifier");
  });

  /**
   * `bun <file>` auto-serves any module whose DEFAULT export has a `fetch`
   * function — probed on bun 1.4 against a plain object, an object with extra
   * keys, and a class instance. So one entry that both exports the handler and
   * starts a server binds the port twice and dies with EADDRINUSE, which is what
   * it did. Nitro splits the same way: its node preset is a serve call with no
   * default export.
   */
  test("the RUNNABLE half is a different module, and exports nothing", () => {
    const plugin = entries();
    const code = plugin.load(plugin.resolveId(SERVE_ENTRY_ID) as string) ?? "";

    expect(code).toContain('import { serveBarq } from "@barqjs/start/serve"');
    expect(code).toContain("serveBarq({");
    expect(code).not.toContain("export default");
    expect(code).not.toContain("export const");
  });

  test("static serving is on by default, and its path resolves at RUNTIME", () => {
    const plugin = entries();
    const code = plugin.load(plugin.resolveId(SERVE_ENTRY_ID) as string) ?? "";
    // `../client`, because this file is `<out>/server/serve.js`. Getting the
    // number of `..` wrong 404s every asset while every page still renders,
    // which is why `test/build.test.ts` fetches an asset for real.
    expect(code).toContain('static: { dir: new URL("../client", import.meta.url).pathname');
    // Never the build machine's absolute path: its layout is not the
    // deployment's, the same mistake the prerender manifest made.
    expect(code).not.toContain(ROOT);
  });

  test("`static: false` is honoured, for the CDN-in-front deployment", () => {
    const code = serveEntryWith({ server: { static: false } });
    expect(code).not.toContain("static:");
    expect(code).toContain("fetch: handler.fetch");
  });

  test("`port` reads PORT first, because every host sets it", () => {
    expect(serveEntryWith({ server: { port: 4321 } })).toContain(
      "port: Number(process.env.PORT ?? 4321)",
    );
    // And defaults to 3000 rather than to srvx's own, so the generated file
    // says what it will do.
    expect(serveEntryWith({})).toContain("port: Number(process.env.PORT ?? 3000)");
  });

  /**
   * The regression this whole arrangement exists to prevent.
   *
   * Both entries used to name `virtual:barq-route-assets`,
   * `virtual:barq-client-assets`, `virtual:barq-server-fns` and the generated
   * table, so overriding one meant transcribing specifiers with no types of
   * their own — and `packages/kitchen-sink/src/virtual.d.ts` existed only to
   * make that transcription typecheck.
   *
   * Grepped across both of TanStack's `start-basic` examples, user code names no
   * `virtual:` and no `#` specifier at all. This is that property, as a gate.
   */
  test("neither entry names a build specifier, because an application copies them", () => {
    const plugin = entries();
    for (const id of [CLIENT_ENTRY_ID, SERVER_ENTRY_ID]) {
      const code = plugin.load(plugin.resolveId(id) as string) ?? "";
      expect(code).not.toContain("virtual:");
      expect(code).not.toContain("#barq-");
      expect(code).not.toContain("routeTree.gen");
    }
  });

  /**
   * `serve.js` is exempt from the rule above, and the exemption is the point:
   * it is the one generated module an application never overrides, because
   * there is nothing in it to override. So it may name its sibling — and only
   * its sibling.
   */
  test("the serve entry names the server entry, and no other specifier", () => {
    const plugin = entries();
    const code = plugin.load(plugin.resolveId(SERVE_ENTRY_ID) as string) ?? "";
    const specifiers = [...code.matchAll(/from\s*["']([^"']+)["']/g)].map((m) => m[1]);
    expect(specifiers.toSorted()).toEqual(["@barqjs/start/serve", SERVER_ENTRY_ID]);
    expect(code).not.toContain("routeTree.gen");
  });

  test("the ROUTER entry is where the generated tree is named, by an ABSOLUTE path", () => {
    // A generated module has no directory of its own, so a relative specifier in
    // one resolves against nothing. This is also the only generated module that
    // names the tree at all — a project writing `src/router.ts` replaces it, and
    // names the tree by an ordinary relative path of its own.
    const plugin = entries();
    const code = plugin.load(plugin.resolveId(ROUTER_ENTRY_ID) as string) ?? "";
    expect(code).toContain(`${ROOT}/src/routeTree.gen.ts`);
    expect(code).toContain("export const config = { routeTree }");
  });
});

describe("the router entry a project DOES write", () => {
  const routerEntry = (root: string): string | null => {
    const plugins = barqStart() as unknown as (Loose & { name: string })[];
    for (const plugin of plugins) plugin.configResolved?.({ root, mode: "development" });
    const entries = plugins.find((one) => one.name === "barq-start:entries") as unknown as {
      resolveId: (id: string) => string | null;
    };
    return entries.resolveId(ROUTER_ENTRY_ID);
  };

  test("a project's own `src/router.ts` wins over the generated default", () => {
    const resolved = routerEntry(join(import.meta.dir, "../test/router-fixture"));
    // The FILE, not the `\0`-prefixed generated id — so the module keeps its own
    // identity in the graph and the watcher sees the file the author edits,
    // which is the reason `resolveId` answers a path for the entries too.
    expect(resolved).toEndWith("/test/router-fixture/src/router.ts");
    expect(resolved).not.toStartWith("\0");
  });

  test("and the file it wins with names no build specifier", () => {
    const source = readFileSync(
      join(import.meta.dir, "../test/router-fixture/src/router.ts"),
      "utf8",
    );
    // IMPORT STATEMENTS, not raw text: the fixture's own comment explains what
    // it is avoiding and says both strings out loud, which a whole-file `grep`
    // reads as the very leak it is documenting.
    const specifiers = [...source.matchAll(/from\s*["']([^"']+)["']/g)].map((m) => m[1]);
    // The property the whole arrangement exists for: what a project writes
    // reaches the route table by an ordinary relative import.
    expect(specifiers.filter((one) => one.startsWith("virtual:"))).toEqual([]);
    expect(specifiers.filter((one) => one.startsWith("#barq-"))).toEqual([]);
  });

  test("without one, the generated default is used and names the tree absolutely", () => {
    const resolved = routerEntry(ROOT);
    expect(resolved).toBe("\0barq-router-entry");
  });

  /**
   * The resolved id has to be SERVABLE, and `\0#barq-router-entry` was not.
   *
   * Vite serves a virtual module at `/@id/__x00__<rest>`. With a `#` leading
   * `<rest>` the browser read the URL as a path plus a FRAGMENT, asked for a
   * module id that does not exist, and got a 404 — so the client entry never
   * loaded and no route in the application hydrated. The document looked
   * perfect, because SSR had already written it; only the interactivity was
   * gone, with one console line to say so.
   *
   * The check is on the RESOLVED id rather than on the public specifier, which
   * keeps its `#` because it is an alias to a real file.
   */
  test("the resolved id carries nothing a URL would read as a fragment or a query", () => {
    const resolved = routerEntry(ROOT) as string;
    expect(resolved.startsWith("\0")).toBe(true);
    for (const character of ["#", "?"]) {
      expect(resolved.includes(character)).toBe(false);
    }
  });
});

describe("`target` pins the srvx adapter at BUILD time", () => {
  const ssrAlias = (options: Parameters<typeof barqStart>[0]): unknown => {
    const plugins = barqStart(options) as unknown as (Loose & { name: string })[];
    for (const plugin of plugins) plugin.configResolved?.({ root: ROOT, mode: "development" });
    for (const plugin of plugins) {
      const config = plugin.config?.({}, { command: "build", mode: "production" }) as
        | { environments?: Record<string, { resolve?: { alias?: unknown } }> }
        | undefined;
      const alias = config?.environments?.ssr?.resolve?.alias;
      if (alias !== undefined) return alias;
    }
    return undefined;
  };

  /**
   * Under a bundler the export condition applied is the BUILD's, not the
   * deployment's, so `import { serve } from "srvx"` in a bundle built on Node
   * carries the Node adapter wherever it is deployed. Naming the target is what
   * pins it, and doing it here costs nothing per request.
   */
  test("naming one rewrites the bare `srvx` specifier", () => {
    expect(ssrAlias({ server: { target: "bun" } })).toEqual([
      { find: /^srvx$/, replacement: "srvx/bun" },
    ]);
  });

  test("the pattern is ANCHORED, so `srvx/static` is left alone", () => {
    const [entry] = ssrAlias({ server: { target: "node" } }) as { find: RegExp }[];
    expect(entry.find.test("srvx")).toBe(true);
    expect(entry.find.test("srvx/static")).toBe(false);
  });

  test("`auto` pins nothing, because srvx's own conditions already answer", () => {
    expect(ssrAlias({})).toEqual([]);
    expect(ssrAlias({ server: { target: "auto" } })).toEqual([]);
  });
});
