/**
 * P6-Q7: does a loader's value reach the SSR seed today, and does it still if
 * `dataFor` mints a `resource` instead of a bare keyed `computed`?
 *
 * No router test asserts the seed CONTENT — `grep -n "BARQ_DATA\|seed"
 * packages/router/src/*.test.ts` finds only the document helper's parameter —
 * yet D9 rests entirely on the key round-tripping, and P-B was a bug in
 * exactly this path.
 */
import { html as ssrHtml, ssrLoading } from "@barqjs/server";
import { computed, resource, runWithOwner } from "@barqjs/core";
import { createPageHandler } from "../../packages/router/src/server.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";

const doc = ({ body, seed }: { body: string; seed: string }): string =>
  `<!doctype html><html><body>${body}${seed}</body></html>`;

const routes: AnyRouteDefinition[] = [
  {
    id: "/users/$id",
    path: "/users/$id",
    loader: async ({ params }: { params: { id: string } }) => {
      await new Promise((r) => setTimeout(r, 10));
      return `Ada-${params.id}`;
    },
    component: ((_s: unknown, props: { data: () => unknown }) =>
      ssrHtml(`<b>${String(props.data())}</b>`)) as never,
  },
] as never;

for (const stream of [false, true]) {
  const handler = createPageHandler({
    routes,
    stream,
    app: (state) => {
      // The compiled shape: the read happens inside the boundary's content.
      const route = state.chain()[0];
      return ssrLoading(null, {
        fallback: () => ssrHtml("<i>loading</i>"),
        children: () =>
          ssrHtml(`<b>${String(route === undefined ? "?" : state.dataFor(route, state.params())())}</b>`),
      });
    },
    document: doc,
  });
  const body = await (await handler(new Request("https://x.test/users/7"))).text();
  console.log(`stream=${stream}`);
  console.log("  html   :", body.replace(/<script[\s\S]*?<\/script>/g, "<SCRIPT/>").slice(0, 200));
  const scripts = [...body.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  console.log("  scripts:", scripts.length === 0 ? "(none)" : scripts.map((s) => s.slice(0, 220)).join("\n           "));
}

// Does a `resource` under NO owner carry a key the same way?
{
  let n = 0;
  const r = runWithOwner(null, () =>
    resource(() => "s", async () => { n++; await new Promise((res) => setTimeout(res, 5)); return "res-value"; }, { key: "r:probe" }),
  );
  const c = runWithOwner(null, () =>
    computed(async () => { await new Promise((res) => setTimeout(res, 5)); return "computed-value"; }, { key: "c:probe" }),
  );
  const { renderPage } = await import("@barqjs/server");
  const page = await renderPage(() =>
    ssrLoading(null, {
      fallback: () => ssrHtml("<i>l</i>"),
      children: () => ssrHtml(`<b>${String(r())}</b><u>${String(c())}</u>`),
    }) as never,
  );
  console.log("\nresource vs computed under renderPage");
  console.log("  html  :", page.html);
  console.log("  seed  :", page.script.slice(0, 400));
  console.log("  fetches:", n);
}
