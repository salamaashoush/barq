import { html as ssrHtml } from "../../packages/router/node_modules/@barqjs/server/src/index.ts";
import { lazy } from "../../packages/router/node_modules/@barqjs/core/src/index.ts";
import { createPageHandler, renderRoutes } from "../../packages/router/src/server.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";

const document = ({ body, head, seed }: any) =>
  `<!doctype html><html><head>${head}</head><body>${body}${seed}</body></html>`;
const get = (p: string) => new Request(`https://example.com${p}`);

// EXACTLY what compiler-rs emits (routes.rs:449-452) for ONE module that fails
// to load — the case `preloadMatched`'s Promise.allSettled deliberately tolerates.
const lazyHead = (load: any) => async (c: any) => {
  const { head } = await load();
  return typeof head === "function" ? head(c) : head;
};
const broken = () => Promise.reject(new Error("Failed to fetch dynamically imported module: /assets/leaf.js"));

const t: AnyRouteDefinition[] = [{
  id: "leaf", path: "/",
  component: lazy(broken as never),
  pending: lazy(broken as never, (m: any) => m.Pending ?? (() => null)),
  loader: async () => undefined,
  head: lazyHead(broken),
}] as never;

const handler = createPageHandler({ routes: t, stream: false, app: (s) => renderRoutes(s) as never, document });
try {
  const r = await handler(get("/"));
  console.log("broken chunk -> status " + r.status);
  console.log((await r.text()).slice(0, 200));
} catch (e) {
  console.log("broken chunk -> HANDLER REJECTED: " + String(e));
}

// A module with NO `head` export, through the SAME generator wrapper: does the
// hole survive, or does it become an empty group that erases the layout?
const none = () => Promise.resolve({ default: () => null });
const t2: AnyRouteDefinition[] = [{
  id: "layout", path: "/",
  head: lazyHead(() => Promise.resolve({ head: { title: "Layout", meta: [{ name: "description", content: "d" }] } })),
  component: (_s: unknown, p: any) => ssrHtml(String(p.children())),
  children: [{ id: "leaf", path: "", head: lazyHead(none), component: () => ssrHtml("<main/>") }],
}] as never;
const h2 = createPageHandler({ routes: t2, stream: false, app: (s) => renderRoutes(s) as never, document });
const b2 = await (await h2(get("/"))).text();
console.log("\nno-head child, generator wrapper -> head bytes: " + (b2.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? ""));
