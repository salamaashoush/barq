import { html as ssrHtml } from "@barqjs/server";
import { computed } from "@barqjs/core";
import { HeadContent, Scripts } from "./components.ts";
import { createPageHandler, renderRoutes } from "./server.ts";
import type { AnyRouteDefinition } from "./route.ts";

const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms));
const late = computed(async () => { await tick(2); return "LATE"; }, { key: "late" });

const shellComponent = ((_s: unknown, p: any) =>
  ssrHtml(`<html><head>${String(HeadContent())}</head><body><div id="app">${String(p.children())}</div>${String(Scripts())}</body></html>`)) as never;

const table: AnyRouteDefinition[] = [
  { id: "__root__", path: "/", shellComponent,
    component: ((_s: unknown, p: any) => ssrHtml(`<main>${String(p.children())}</main>`)) as never,
    children: [{ id: "/", path: "", loader: async () => { await tick(2); return "LATE"; },
      component: ((_s: unknown, p: any) => ssrHtml(`<b>${String(p.data() ?? "…")}</b>`)) as never }] },
] as never;

const handler = createPageHandler({ routes: table, app: (s) => renderRoutes(s) as never });
const body = await (await handler(new Request("https://x/"))).text();
const closeBody = body.indexOf("</body>");
console.log("</body> at", closeBody, "| doc ends with </html>?", body.trimEnd().endsWith("</html>"));
for (const m of ["__BARQ_EVTS__", "__BARQ_SWAP__", "<template data-barq", "__BARQ_DATA__"]) {
  const at = body.indexOf(m);
  console.log(`  ${m.padEnd(22)} at ${String(at).padStart(6)}  ${at === -1 ? "(absent)" : at < closeBody ? "INSIDE body ✓" : "AFTER </body> ✗"}`);
}
