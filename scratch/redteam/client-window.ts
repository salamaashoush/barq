import { flush } from "../../packages/router/node_modules/@barqjs/core/src/index.ts";
import { createRouter } from "../../packages/router/src/router.ts";
import { memoryHistory } from "../../packages/router/src/history.ts";
import { installHead, renderHead, resolveHead } from "../../packages/router/src/head.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// EXACTLY the generator's wrapper (compiler-rs/src/routes.rs:415-417), over a
// module that takes 60ms to arrive — a cold code-split chunk.
const lazyHead = (load: () => Promise<any>) => async (context: any) => {
  const { head } = await load();
  return typeof head === "function" ? head(context) : head;
};
const chunk = (head: unknown, ms: number) => async () => { await sleep(ms); return { head }; };

const routes: AnyRouteDefinition[] = [
  { id: "/", path: "/",      head: lazyHead(chunk({ title: "Home",  link: [{ rel: "canonical", href: "https://x/" }] }, 0)),  component: (() => null) as never },
  { id: "/b", path: "/slow", head: lazyHead(chunk({ title: "Slow",  link: [{ rel: "canonical", href: "https://x/slow" }] }, 60)), component: (() => null) as never },
] as never;

document.head.innerHTML = renderHead(resolveHead([{ title: "Home", link: [{ rel: "canonical", href: "https://x/" }] }]));

const state = createRouter({ routes, history: memoryHistory({ initial: ["/"] }) });
await state.start();
installHead(state as never);
flush();
await sleep(20);
console.log("t=0    (settled home) title=" + JSON.stringify(document.title) + "  canonical=" + document.querySelector('link[rel=canonical]')?.getAttribute("href"));

const t0 = Date.now();
await state.navigate("/slow");
flush();
console.log(`t=+${Date.now()-t0}ms  location=${state.location().pathname}  title=${JSON.stringify(document.title)}  canonical=${document.querySelector('link[rel=canonical]')?.getAttribute("href")}   <-- COMMITTED, head still OLD?`);
for (const ms of [1, 10, 30, 80]) {
  await sleep(ms);
  console.log(`t=+${Date.now()-t0}ms  title=${JSON.stringify(document.title)}  canonical=${document.querySelector('link[rel=canonical]')?.getAttribute("href")}`);
}

// A head() that THROWS on the client: is the rejection handled?
process.on("unhandledRejection", (e) => console.log("!! UNHANDLED REJECTION: " + String(e)));
const boom: AnyRouteDefinition[] = [
  { id: "/", path: "/", head: () => { throw new Error("client head blew up"); }, component: (() => null) as never },
] as never;
const s2 = createRouter({ routes: boom, history: memoryHistory({ initial: ["/"] }) });
await s2.start();
installHead(s2 as never);
flush();
await sleep(50);
console.log("after a throwing head(), document.title = " + JSON.stringify(document.title));
