import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register({ url: "http://localhost/" });
const { flush, scope, render } = await import("@barqjs/core");
const { renderDepth } = await import("../../packages/router/src/components.ts");
const { createRouter } = await import("../../packages/router/src/router.ts");
const { memoryHistory } = await import("../../packages/router/src/history.ts");

const tick = async (): Promise<void> => { flush(); await new Promise((r) => setTimeout(r, 4)); flush(); };
const started: { id: string; at: number }[] = [];
const DELAY = 40;
const mk = (id: string, path: string, children?: unknown[]): unknown => ({
  id, path, children,
  loader: async () => { started.push({ id, at: Date.now() }); await new Promise((r) => setTimeout(r, DELAY)); return id.toUpperCase(); },
  component: ((s: unknown, p: { data: () => unknown; children: unknown }) => {
    const el = document.createElement(`x-${id}`);
    el.textContent = String(p.data());
    if (children !== undefined) {
      const kid = (p.children as (sc: unknown) => unknown)(s);
      if (kid instanceof Node) el.append(kid);
    }
    return el;
  }),
});
const routes = [mk("a", "/app", [mk("b", "b", [mk("c", "$id")])])] as never;
const state = createRouter({ routes, history: memoryHistory({ initial: ["/app/b/7"] }) });
const container = document.createElement("div");
document.body.append(container);
const t0 = Date.now();
try {
  render((s) => renderDepth(s, state, 0, null, null) as never, container);
} catch (e) { console.log("render threw", (e as Error).name, (e as Error).message); }
for (let i = 0; i < 80; i++) {
  await tick();
  if (i % 10 === 0) console.log(`  t=${Date.now() - t0}ms html=${JSON.stringify(container.innerHTML)} started=${started.map((s) => s.id).join(",")}`);
  if (container.innerHTML.includes("C")) break;
}
console.log("final html  :", container.innerHTML);
console.log("loader start:", JSON.stringify(started.map((s) => ({ id: s.id, t: s.at - t0 }))));
state.dispose();
