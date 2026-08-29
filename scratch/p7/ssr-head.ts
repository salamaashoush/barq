import { html as ssrHtml } from "../../packages/router/node_modules/@barqjs/server/src/index.ts";
import { HeadContent } from "../../packages/router/src/components.ts";
import { createPageHandler, renderRoutes } from "../../packages/router/src/server.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";

const get = (p: string) => new Request(`https://example.com${p}`);
const ran: string[] = [];

const shellComponent = ((_s: unknown, p: any) =>
  ssrHtml(
    `<html><head>${String(HeadContent())}</head><body>${String(p.children())}</body></html>`,
  )) as never;

const table: AnyRouteDefinition[] = [
  {
    id: "root",
    path: "/",
    shellComponent,
    beforeLoad: () => ({ user: "ada" }),
    head: () => {
      ran.push("root");
      return { meta: [{ name: "root", content: "yes" }, { title: "Root" }] };
    },
    component: ((_s: unknown, p: any) => ssrHtml(`<div>${String(p.children())}</div>`)) as never,
    children: [
      {
        id: "account",
        path: "account",
        ssr: false,
        beforeLoad: () => ({ account: "42" }),
        head: () => {
          ran.push("account");
          return { meta: [{ title: "Account" }] };
        },
        component: ((_s: unknown, p: any) => ssrHtml(`<main>${String(p.children())}</main>`)) as never,
        children: [
          {
            id: "leaf",
            path: "leaf",
            head: () => {
              ran.push("leaf");
              return { meta: [{ name: "leaf", content: "SHIPPED-BELOW-SSR-FALSE" }] };
            },
            component: (() => ssrHtml("<span>leaf</span>")) as never,
          },
        ],
      },
    ],
  },
] as never;

const handler = createPageHandler({
  routes: table,
  stream: false,
  app: (s) => renderRoutes(s) as never,
});
const body = await (await handler(get("/account/leaf"))).text();
console.log("heads that RAN on the server:", ran.join(", "));
console.log("head bytes:", body.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? "(none)");
console.log("body bytes:", body.match(/<body>([\s\S]*?)<\/body>/)?.[1]?.slice(0, 200) ?? "(none)");
