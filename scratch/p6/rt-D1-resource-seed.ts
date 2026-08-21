/**
 * RED-D1: §1.2 makes the loader cell a `resource` under a per-entry DETACHED
 * root. `resource` builds TWO computeds: `fetched` (gets the explicit key) and
 * `view` (gets NO options, so `options?.key === undefined` and it reserves an
 * auto-key slot on whatever owner is current — async.ts:186-193).
 *
 * Q1: how many seed entries does one resource produce?
 * Q2: what KEY does the extra one carry, and is it stable?
 * Q3: does the router's cell shape actually round-trip through createPageHandler?
 */
import { html as ssrHtml, ssrLoading, renderPage } from "@barqjs/server";
import { computed, resource, root, runWithOwner } from "@barqjs/core";
import { createPageHandler, renderRoutes } from "../../packages/router/src/server.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";

// ---------- Q1/Q2: seed shape of a resource under a detached root
for (const shape of ["runWithOwner(null)", "detached root()"] as const) {
  const make = (): (() => unknown) => {
    const build = (): (() => unknown) =>
      resource(() => "s", async () => { await new Promise((r) => setTimeout(r, 5)); return "RES"; },
        { key: "r:probe|id=7" }) as unknown as () => unknown;
    return shape === "detached root()" ? root(() => build()) : (runWithOwner(null, build) as () => unknown);
  };
  const cell = make();
  const page = await renderPage(() =>
    ssrLoading(null, { fallback: () => ssrHtml("<i>l</i>"), children: () => ssrHtml(`<b>${String(cell())}</b>`) }) as never,
  );
  const data = /window\.__BARQ_DATA__=\(([\s\S]*?)\);window/.exec(page.script)?.[1] ?? "?";
  console.log(`${shape.padEnd(20)} html=${page.html} seed=${data}`);
}

// ---------- Q3: full round trip through the real page handler
const doc = ({ body, seed }: { body: string; seed: string }): string => `<body>${body}${seed}</body>`;
for (const kind of ["computed", "resource"] as const)
  for (const stream of [false, true]) {
    const cells = new Map<string, () => unknown>();
    const routes: AnyRouteDefinition[] = [
      {
        id: "/users/$id",
        path: "/users/$id",
        loader: async ({ params }: { params: { id: string } }) => `Ada-${params.id}`,
        component: ((_s: unknown, p: { data: () => unknown }) => ssrHtml(`<b>${String(p.data())}</b>`)) as never,
      },
    ] as never;
    const handler = createPageHandler({
      routes, stream,
      app: (state) => {
        // swap dataFor for the DESIGNED shape: a resource under a detached root
        const original = state.dataFor;
        (state as unknown as { dataFor: typeof state.dataFor }).dataFor = (route, params) => {
          if (kind === "computed") return original(route, params);
          const key = `r:${route.id}|${Object.keys(params).toSorted().map((k) => `${k}=${params[k]}`).join("&")}`;
          const found = cells.get(key);
          if (found !== undefined) return found as never;
          const made = root(() =>
            resource(() => params, async (p) => {
              await new Promise((r) => setTimeout(r, 5));
              return `Ada-${(p as { id: string }).id}`;
            }, { key }),
          ) as unknown as () => unknown;
          cells.set(key, made);
          return made as never;
        };
        return renderRoutes(state);
      },
      document: doc,
    });
    let body = "";
    try { body = await (await handler(new Request("https://x.test/users/7"))).text(); }
    catch (e) { body = `<THREW ${(e as Error).name}: ${(e as Error).message}>`; }
    const keys = [...new Set([...body.matchAll(/"([^"]+)":/g)].map((m) => m[1]))];
    console.log(
      `kind=${kind.padEnd(9)} stream=${String(stream).padEnd(5)}`,
      "markup", JSON.stringify(body.replace(/<script[\s\S]*?<\/script>/g, "").slice(0, 80)),
      "seedKeys", JSON.stringify(keys),
    );
  }
