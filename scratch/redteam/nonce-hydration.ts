import { flush } from "../../packages/router/node_modules/@barqjs/core/src/index.ts";
import { createRouter } from "../../packages/router/src/router.ts";
import { memoryHistory } from "../../packages/router/src/history.ts";
import { installHead, renderHead, resolveHead, HEAD_OWNER } from "../../packages/router/src/head.ts";
import type { AnyRouteDefinition } from "../../packages/router/src/route.ts";

const head = { title: "Home", style: [{ children: ".a{color:red}" }] };
// what the SERVER wrote, with a CSP nonce
document.head.innerHTML = renderHead(resolveHead([head]), "N0NCE");
console.log("server bytes : " + document.head.innerHTML);
const before = document.head.querySelector("style");

const routes: AnyRouteDefinition[] = [{ id: "/", path: "/", head, component: (() => null) as never }] as never;
const state = createRouter({ routes, history: memoryHistory({ initial: ["/"] }) });
await state.start();
installHead(state as never);          // <- what entry-client.tsx:32 does
flush();
await new Promise((r) => setTimeout(r, 20));
console.log("after install: " + document.head.innerHTML);
console.log("same <style> node? " + (before === document.head.querySelector("style")));
console.log("nonce survived?  " + JSON.stringify(document.head.querySelector("style")?.getAttribute("nonce")));
