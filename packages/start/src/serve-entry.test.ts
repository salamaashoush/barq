import { afterAll, expect, test } from "bun:test";

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { type BarqStartOptions, SERVE_ENTRY_ID, barqStart } from "./vite.ts";

const sandbox = mkdtempSync(join(tmpdir(), "barq-serve-"));

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

interface Entries {
  name: string;
  configResolved?: (config: unknown) => void;
  resolveId?: (id: string) => string | null;
  load?: (id: string) => string | null;
}

interface Served {
  static?: { dir?: string | URL };
  maxBodySize?: number;
  maxFormSize?: number;
}

/** The generated `serve.js`, with its two imports swapped for a recorder. */
const serveEntryIn = async (project: string, options?: BarqStartOptions): Promise<Served> => {
  const plugins = barqStart(options) as unknown as Entries[];
  for (const plugin of plugins) plugin.configResolved?.({ root: project, mode: "production" });
  const entries = plugins.find((one) => one.name === "barq-start:entries");
  const source = entries?.load?.(entries.resolveId?.(SERVE_ENTRY_ID) ?? "") ?? "";

  const server = join(project, "dist", "server");
  mkdirSync(server, { recursive: true });
  mkdirSync(join(project, "dist", "client"), { recursive: true });
  writeFileSync(
    join(server, "record.js"),
    "export const serveBarq = (options) => { globalThis.barqServed = options; };\n" +
      "export default { fetch: () => new Response(null) };\n",
  );
  writeFileSync(
    join(server, "serve.js"),
    source
      .replace('"@barqjs/start/serve"', '"./record.js"')
      .replace(/import handler from "[^"]+";/, 'import handler from "./record.js";'),
  );

  await import(pathToFileURL(join(server, "serve.js")).href);
  return (globalThis as { barqServed?: Served }).barqServed ?? {};
};

test("the static directory resolves for a plain project path", async () => {
  const options = await serveEntryIn(join(sandbox, "acme-site"));

  expect(existsSync(options.static?.dir as string | URL)).toBe(true);
});

test("the static directory resolves when the project path holds a space", async () => {
  const project = join(sandbox, "acme site");
  const options = await serveEntryIn(project);

  expect(options.static?.dir).toBeDefined();
  expect(existsSync(options.static?.dir as string | URL)).toBe(true);
});

test("the body caps a project configured reach the server it runs", async () => {
  const options = await serveEntryIn(join(sandbox, "acme-uploads"), {
    server: { maxBodySize: 65_536, maxFormSize: 8_388_608 },
  });

  expect(options.maxBodySize).toBe(65_536);
  expect(options.maxFormSize).toBe(8_388_608);
});

test("a project that configured none leaves the handler's defaults in charge", async () => {
  const options = await serveEntryIn(join(sandbox, "acme-defaults"));

  expect(options.maxBodySize).toBeUndefined();
  expect(options.maxFormSize).toBeUndefined();
});

/**
 * The generated server is the one most deployments run, and most of those sit
 * behind a proxy that terminates TLS. Without these two it sees `http://` where
 * the browser's `Origin` says `https://`, and refuses every server function.
 */
test("what the proxy in front is trusted for reaches the server it runs", async () => {
  const options = (await serveEntryIn(join(sandbox, "acme-proxied"), {
    server: { trustProxy: "loopback", allowedOrigins: ["https://admin.example.com"] },
  })) as { trustProxy?: unknown; allowedOrigins?: unknown };

  expect(options.trustProxy).toBe("loopback");
  expect(options.allowedOrigins).toEqual(["https://admin.example.com"]);
});

test("a list of proxy addresses is carried as written", async () => {
  const options = (await serveEntryIn(join(sandbox, "acme-proxy-list"), {
    server: { trustProxy: ["10.0.0.1", "10.0.0.2"] },
  })) as { trustProxy?: unknown };

  expect(options.trustProxy).toEqual(["10.0.0.1", "10.0.0.2"]);
});

test("the origins the dev server allows are not the deployed server's", async () => {
  const options = (await serveEntryIn(join(sandbox, "acme-dev-origins"), {
    allowedOrigins: ["http://localhost:5173"],
  })) as { trustProxy?: unknown; allowedOrigins?: unknown };

  expect(options.allowedOrigins).toBeUndefined();
  expect(options.trustProxy).toBeUndefined();
});
