import { html as ssrHtml } from "../../packages/router/node_modules/@barqjs/server/src/index.ts";
import { createPageHandler } from "../../packages/router/src/server.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";

const document = ({ body, head, seed }: { body: string; head: string; seed: string }): string =>
  `<!doctype html><html><head>${head}</head><body>${body}${seed}</body></html>`;
const get = (p: string) => new Request(`https://example.com${p}`);
const show = (l: string, v: unknown) => console.log(`\n--- ${l} ---\n${v}`);

const ran: string[] = [];
const table = (leafSsr: boolean | "data-only" | undefined): AnyRouteDefinition[] =>
  [
    {
      id: "layout",
      path: "/app",
      context: () => ({ tier: "free" }),
      beforeLoad: () => { ran.push("layout.beforeLoad"); return { user: "ada" }; },
      head: () => { ran.push("layout.head"); return { title: "Layout" }; },
      component: (_s: unknown, p: { children: () => unknown }) => ssrHtml(`<header>${String(p.children())}</header>`),
      pending: () => ssrHtml("<i>layout-skeleton</i>"),
      children: [
        {
          id: "leaf",
          path: "$id",
          ssr: leafSsr,
          beforeLoad: () => { ran.push("leaf.beforeLoad"); return { account: 42 }; },
          head: (c: { context: Record<string, unknown>; params: Record<string, string> }) => {
            ran.push("leaf.head ctx=" + JSON.stringify(c.context));
            // A head that depends on what its OWN beforeLoad produced.
            return { title: `Account ${String(c.context.account)} of ${String(c.context.user)}` };
          },
          component: () => ssrHtml("<main>leaf</main>"),
          pending: () => ssrHtml("<i>leaf-skeleton</i>"),
        },
      ],
    },
  ] as never;

for (const mode of [undefined, "data-only", false] as const) {
  ran.length = 0;
  const handler = createPageHandler({ routes: table(mode), stream: false, app: (s) => (require("../../packages/router/src/server.ts").renderRoutes)(s) as never, document });
  const body = await (await handler(get("/app/7"))).text();
  show(`ssr=${String(mode)} (stream:false)`, [
    "ran: " + JSON.stringify(ran),
    "head bytes: " + (body.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? ""),
  ].join("\n"));
}

// STREAM mode (the default) — is the head in the shell?
for (const mode of [undefined, false] as const) {
  ran.length = 0;
  const handler = createPageHandler({ routes: table(mode), app: (s) => (require("../../packages/router/src/server.ts").renderRoutes)(s) as never, document });
  const body = await (await handler(get("/app/7"))).text();
  show(`ssr=${String(mode)} (STREAM, default)`, [
    "ran: " + JSON.stringify(ran),
    "head bytes: " + (body.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? ""),
  ].join("\n"));
}

// A head() that THROWS
{
  const t: AnyRouteDefinition[] = [{
    id: "boom", path: "/",
    head: () => { throw new Error("head blew up"); },
    component: () => ssrHtml("<main>x</main>"),
  }] as never;
  const handler = createPageHandler({ routes: t, stream: false, app: () => ssrHtml("<main>x</main>"), document });
  try {
    const r = await handler(get("/"));
    show("head() throws", `status ${r.status}\n` + (await r.text()).slice(0, 300));
  } catch (e) {
    show("head() throws", "HANDLER REJECTED: " + String(e));
  }
}

// A head() that redirects — beforeLoad can; can head?
{
  const { redirect } = await import("../../packages/router/src/server.ts");
  const t: AnyRouteDefinition[] = [{
    id: "r", path: "/",
    head: () => { throw redirect("/elsewhere"); },
    component: () => ssrHtml("<main>x</main>"),
  }] as never;
  const handler = createPageHandler({ routes: t, stream: false, app: () => ssrHtml("<main>x</main>"), document });
  try {
    const r = await handler(get("/"));
    show("head() throws redirect()", `status ${r.status} location=${r.headers.get("location")}`);
  } catch (e) {
    show("head() throws redirect()", "HANDLER REJECTED: " + String(e));
  }
}
