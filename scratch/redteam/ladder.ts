import { HEAD_OWNER, applyHead, captureHead, identityOf, renderHead, resolveHead } from "../../packages/router/src/head.ts";
import type { HeadDescriptor } from "../../packages/router/src/head.ts";

const html = (chain: readonly (HeadDescriptor | undefined)[]) => renderHead(resolveHead(chain));
const ids = (chain: readonly (HeadDescriptor | undefined)[]) =>
  resolveHead(chain).map((t) => `${t.tag}  ${t.identity}  ${JSON.stringify(t.attrs)}${t.children ? " :: " + t.children : ""}`);
const show = (label: string, v: unknown) => console.log(`\n--- ${label} ---\n` + (Array.isArray(v) ? v.join("\n") : String(v)));

// 4a THEME-COLOR, same route
show("4a-i same route light+dark", ids([{ meta: [
  { name: "theme-color", content: "#fff", media: "(prefers-color-scheme: light)" },
  { name: "theme-color", content: "#000", media: "(prefers-color-scheme: dark)" },
]}]));

// 4a parent light, child dark
show("4a-ii parent light / child dark", ids([
  { meta: [{ name: "theme-color", content: "#fff", media: "(prefers-color-scheme: light)" }] },
  { meta: [{ name: "theme-color", content: "#000", media: "(prefers-color-scheme: dark)" }] },
]));

// 4a-iii parent declares BOTH, child declares only dark
show("4a-iii parent both / child dark only", ids([
  { meta: [
    { name: "theme-color", content: "#fff", media: "(prefers-color-scheme: light)" },
    { name: "theme-color", content: "#000", media: "(prefers-color-scheme: dark)" },
  ]},
  { meta: [{ name: "theme-color", content: "#111", media: "(prefers-color-scheme: dark)" }] },
]));

// 4a-iv media whitespace variance
show("4a-iv media whitespace variance", [
  identityOf("meta", { name: "theme-color", media: "(prefers-color-scheme: dark)" }, 0),
  identityOf("meta", { name: "theme-color", media: "(prefers-color-scheme:dark)" }, 1),
]);

// 4b alternate collisions
show("4b rss vs hreflang, same href", [
  identityOf("link", { rel: "alternate", type: "application/rss+xml", href: "/feed" }, 0),
  identityOf("link", { rel: "alternate", hreflang: "en", href: "/feed" }, 1),
]);
show("4b rss vs atom, same href (both unkeyed alternates)", [
  identityOf("link", { rel: "alternate", type: "application/rss+xml", href: "/feed" }, 0),
  identityOf("link", { rel: "alternate", type: "application/atom+xml", href: "/feed" }, 1),
]);
show("4b rss+atom same href ACROSS routes", ids([
  { link: [{ rel: "alternate", type: "application/rss+xml", href: "/feed" }] },
  { link: [{ rel: "alternate", type: "application/atom+xml", href: "/feed" }] },
]));

// 4c three og:image parent + one child
show("4c 3 og:image parent + 1 child", ids([
  { meta: [
    { property: "og:image", content: "/1.png" },
    { property: "og:image", content: "/2.png" },
    { property: "og:image", content: "/3.png" },
  ]},
  { meta: [{ property: "og:image", content: "/page.png" }] },
]));
// 4c' child declares og:title only -> parent's og:image survives?
show("4c' child declares og:title only", ids([
  { meta: [{ property: "og:image", content: "/1.png" }, { property: "og:image", content: "/2.png" }] },
  { meta: [{ property: "og:title", content: "Page" }] },
]));

// 4d same stylesheet parent + child
show("4d same stylesheet in parent and child", ids([
  { link: [{ rel: "stylesheet", href: "/a.css" }] },
  { link: [{ rel: "stylesheet", href: "/a.css" }] },
]));
// 4d' cascade order
show("4d' cascade order: parent [a,b], child [a,c]", ids([
  { link: [{ rel: "stylesheet", href: "/a.css" }, { rel: "stylesheet", href: "/b.css" }] },
  { link: [{ rel: "stylesheet", href: "/a.css" }, { rel: "stylesheet", href: "/c.css" }] },
]));

// 4e http-equiv vs name
show("4e http-equiv vs name CSP", [
  identityOf("meta", { "http-equiv": "content-security-policy", content: "x" }, 0),
  identityOf("meta", { name: "content-security-policy", content: "x" }, 1),
]);
show("4e' meta with BOTH name and property", [
  identityOf("meta", { name: "twitter:image", property: "og:image", content: "/x" }, 0),
  identityOf("meta", { property: "og:image", content: "/x" }, 1),
]);

// 4f scripts: is the identity really "unique, never collides"?
show("4f script identity is DETERMINISTIC per (depth, position)", [
  "layoutA depth0 pos0: " + resolveHead([{ script: [{ src: "/analytics.js" }] }])[0].identity,
  "routeB  depth1 pos0: " + resolveHead([undefined, { script: [{ src: "/other.js" }] }])[0].identity,
  "routeC  depth1 pos0: " + resolveHead([undefined, { script: [{ src: "/third.js" }] }])[0].identity,
]);
show("4f' two sibling routes at same depth COLLIDE", ids([
  { script: [{ src: "/layout.js" }] },
  { script: [{ src: "/leaf-a.js" }] },
]));

// 4f'' ordinal SHIFT: same script, one route with a title, one without
show("4f'' ORDINAL SHIFT when title appears/disappears", [
  "with title:    " + resolveHead([{ title: "T", script: [{ src: "/analytics.js" }] }]).find(t=>t.tag==="script")!.identity,
  "without title: " + resolveHead([{ script: [{ src: "/analytics.js" }] }]).find(t=>t.tag==="script")!.identity,
  "with 1 meta:   " + resolveHead([{ meta:[{name:"d",content:"x"}], script: [{ src: "/analytics.js" }] }]).find(t=>t.tag==="script")!.identity,
]);

// 5 renderHead ownership on EVERY tag, incl. nonce
show("5 nonce + client reuse", renderHead(resolveHead([{ script: [{ children: "a=1" }], style: [{ children: "b{}" }] }]), "N0NCE"));

console.log("\n=== raw HTML samples ===");
console.log(html([{ meta: [
  { name: "theme-color", content: "#fff", media: "(prefers-color-scheme: light)" },
  { name: "theme-color", content: "#000", media: "(prefers-color-scheme: dark)" },
]}]));
