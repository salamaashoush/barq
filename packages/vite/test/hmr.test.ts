/**
 * A route edit under `vite dev`, through a real dev server and its watcher.
 *
 * Every hot payload the client environment sends is recorded. An edit inside a
 * route's component has to arrive as an `update` for the split half alone; an
 * edit to the options the router read once has to reload the page.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type HotPayload, type ViteDevServer, createServer } from "vite";

import { cleanUp, project } from "./project.ts";

interface Dev {
  server: ViteDevServer;
  edit: (file: string, from: string, to: string) => Promise<HotPayload[]>;
}

const open: ViteDevServer[] = [];

afterEach(async () => {
  for (const server of open.splice(0)) await server.close();
  cleanUp();
});

/**
 * A dev server of its own for each edit. The watcher drops a write that lands
 * within a few milliseconds of the last event for the same file (chokidar
 * throttles a file for 5 ms, and Bun's `fs.watch` suppresses a repeat within
 * 1 ms), and nothing says when that window has closed, so a file is edited once
 * per server.
 */
async function dev(): Promise<Dev> {
  const root = project("full-stack");
  const sent: HotPayload[] = [];
  let propagated = (): void => {};
  const server = await createServer({
    root,
    configLoader: "runner",
    logLevel: "silent",
    server: {
      // Vite calls this for a change once every plugin's `hotUpdate` has run,
      // and the payloads are sent by the time it returns: the end of what one
      // edit can send, so a late reload has nowhere to hide.
      hotUpdateEnvironments: async (vite, hmr) => {
        await Promise.all(Object.values(vite.environments).map((environment) => hmr(environment)));
        propagated();
      },
    },
  });
  open.push(server);
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
  // `createServer` returns before its watcher has attached to a single file,
  // and on Linux a write just after chokidar's `ready` can still go unreported,
  // so a write the watcher does report is the only proof it is listening. The
  // probe is a file created after the scan, so its watch is younger than the
  // route's, and nothing imports it, so its changes send nothing to a browser.
  // The interval paces the writes and is not what the wait ends on.
  const probe = join(server.config.root, "watch-probe.txt");
  const listening = new Promise<void>((resolve) => {
    const heard = (file: string): void => {
      if (file !== probe) return;
      server.watcher.off("change", heard);
      resolve();
    };
    server.watcher.on("change", heard);
  });
  let writes = 0;
  const writing = setInterval(() => writeFileSync(probe, String(writes++)), 20);
  await listening;
  clearInterval(writing);

  const edit = async (file: string, from: string, to: string): Promise<HotPayload[]> => {
    sent.length = 0;
    const path = join(root, file);
    const source = readFileSync(path, "utf8");
    expect(source).toContain(from);
    const answered = new Promise<void>((resolve) => {
      propagated = () => {
        if (sent.some((payload) => payload.type === "update" || payload.type === "full-reload")) {
          resolve();
        }
      };
    });
    writeFileSync(path, source.replace(from, to));
    await answered;
    return [...sent];
  };
  return { server, edit };
}

describe("a route edit under vite dev", () => {
  test("the split half is the module that serves the component, and it accepts itself", async () => {
    const { server } = await dev();
    const graph = server.environments.client.moduleGraph;
    const split = await graph.getModuleByUrl("/src/routes/about.tsx?barq-split");
    const reference = await graph.getModuleByUrl("/src/routes/about.tsx");
    expect(split?.isSelfAccepting).toBe(true);
    expect(reference?.isSelfAccepting).toBe(false);
  }, 60_000);

  test("an edit inside the component updates in place and reloads nothing", async () => {
    const { edit } = await dev();
    const payloads = await edit("src/routes/about.tsx", "<h1>About</h1>", "<h1>About us</h1>");
    expect(payloads.map((payload) => payload.type)).not.toContain("full-reload");
    const updates = payloads.flatMap((payload) =>
      payload.type === "update" ? payload.updates : [],
    );
    expect([...new Set(updates.map((update) => update.path))]).toEqual([
      "/src/routes/about.tsx?barq-split",
    ]);
  }, 60_000);

  test("an edit to the route's options reloads, because the router read them once", async () => {
    const { edit } = await dev();
    const payloads = await edit(
      "src/routes/about.tsx",
      "loader: () => greeting(),",
      "loader: () => greeting(), staleTime: 1,",
    );
    expect(payloads.map((payload) => payload.type)).toContain("full-reload");
  }, 60_000);
});
