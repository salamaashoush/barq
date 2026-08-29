import { hydrate, island, template } from "@barqjs/core";
import { ssrIsland, html as ssrHtml } from "./ssr.ts";
import { renderToString } from "./server.ts";

const page = () =>
  ssrHtml(`<div>${String(ssrIsland(null, (() => ssrHtml("<p>static island</p>")) as never))}</div>`);
const markup = renderToString(page as never);
console.log("SERVED:", markup);

const host = document.createElement("div");
document.body.appendChild(host);
host.innerHTML = markup;
const islandNode = host.querySelector("p");

let built = 0;
const clientTree = ((s: never) => {
  const root = template(`<div></div>`)() as HTMLElement;
  island(s, root, null, (() => { built++; return document.createTextNode("REBUILT"); }) as never);
  return root;
}) as never;

try {
  hydrate(clientTree, host);
  console.log("report:", JSON.stringify(hydrate.report));
} catch (e) {
  console.log("THREW:", String(e).slice(0, 200));
}
console.log("island body rebuilt?", built, "(0 = skipped)");
console.log("island node identity kept?", islandNode === host.querySelector("p"));
console.log("AFTER :", host.innerHTML);
host.remove();
