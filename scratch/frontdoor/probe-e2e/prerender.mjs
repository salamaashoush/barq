import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const mod = await import(pathToFileURL(`${import.meta.dirname}/dist/server/server.js`).href);
console.log("[prerender] server entry exports:", Object.keys(mod));
const prerender = mod.createFetch({ stream: false, refuseRequest: "a prerendered page has no request" });

const paths = ["/users/7", "/users/8"];
const out = `${import.meta.dirname}/dist/client`;
for (const p of paths) {
  const res = await prerender(new Request(`http://prerender.local${p}`));
  const html = await res.text();
  const file = join(out, p.replace(/^\//, ""), "index.html");
  mkdirSync(join(out, p.replace(/^\//, "")), { recursive: true });
  writeFileSync(file, html);
  const bad = ["__BARQ_SWAP__", "<template data-barq=", "__BARQ_SEED__"].filter((s) => html.includes(s));
  console.log(`[prerender] ${p} -> ${res.status} ${html.length}B  streaming-artefacts:${bad.length ? bad.join(",") : "none"}`);
  console.log("   " + html.slice(0, 210));
}
