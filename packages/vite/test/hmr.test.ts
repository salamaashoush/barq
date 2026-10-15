/**
 * A route edit under `vite dev`, through a real dev server and its watcher.
 *
 * Every hot payload the client environment sends is recorded. An edit inside a
 * route's component has to arrive as an `update` for the split half alone; an
 * edit to the options the router read once has to reload the page.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type HotPayload, type ViteDevServer, createServer } from "vite";

import { cleanUp, project } from "./project.ts";

let root = "";
let server: ViteDevServer;
const sent: HotPayload[] = [];

beforeAll(async () => {
  root = project("full-stack");
  server = await createServer({ root, configLoader: "runner", logLevel: "silent" });
  // Both doors to the browser: the client environment's channel, and the
  // socket a plugin can still write to directly. The first sends through the
  // second, so one payload can be recorded twice.
  const client = server.environments.client;
  for (const channel of [client.hot, server.ws]) {
    const send = channel.send.bind(channel);
    channel.send = (payload: HotPayload) => {
      sent.push(payload);
      send(payload);
    };
  }
  // What a browser on `/about` has asked for: the route module and the
  // component half it imports.
  await client.transformRequest("/src/routes/about.tsx");
  await client.transformRequest("/src/routes/about.tsx?barq-split");
}, 60_000);

afterAll(async () => {
  await server?.close();
  cleanUp();
});

async function edit(file: string, from: string, to: string): Promise<HotPayload[]> {
  sent.length = 0;
  const path = join(root, file);
  const source = readFileSync(path, "utf8");
  expect(source).toContain(from);
  writeFileSync(path, source.replace(from, to));
  for (let waited = 0; waited < 100; waited++) {
    if (sent.some((payload) => payload.type === "update" || payload.type === "full-reload")) break;
    await Bun.sleep(50);
  }
  // A late reload would follow the update it raced.
  await Bun.sleep(300);
  return [...sent];
}

describe("a route edit under vite dev", () => {
  test("the split half is the module that serves the component, and it accepts itself", async () => {
    const graph = server.environments.client.moduleGraph;
    const split = await graph.getModuleByUrl("/src/routes/about.tsx?barq-split");
    const reference = await graph.getModuleByUrl("/src/routes/about.tsx");
    expect(split?.isSelfAccepting).toBe(true);
    expect(reference?.isSelfAccepting).toBe(false);
  });

  test("an edit inside the component updates in place and reloads nothing", async () => {
    const payloads = await edit("src/routes/about.tsx", "<h1>About</h1>", "<h1>About us</h1>");
    expect(payloads.map((payload) => payload.type)).not.toContain("full-reload");
    const updates = payloads.flatMap((payload) =>
      payload.type === "update" ? payload.updates : [],
    );
    expect([...new Set(updates.map((update) => update.path))]).toEqual([
      "/src/routes/about.tsx?barq-split",
    ]);
  }, 30_000);

  test("an edit to the route's options reloads, because the router read them once", async () => {
    const payloads = await edit(
      "src/routes/about.tsx",
      "loader: () => greeting(),",
      "loader: () => greeting(), staleTime: 1,",
    );
    expect(payloads.map((payload) => payload.type)).toContain("full-reload");
  }, 30_000);
});
