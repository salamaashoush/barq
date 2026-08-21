import { computed } from "../../core/src/signals.ts";
import { renderPage } from "../src/server.ts";
import { esc, html as ssrHtml, ssrLoading } from "../src/ssr.ts";

let calls = 0;
const page = (): unknown => {
  // D9's exact shape: loader created INSIDE the render, explicit key
  const data = computed(async () => { calls++; await new Promise(r => setTimeout(r, 5)); return "Ada"; },
    { key: "r:/users/$id|{id:7}" });
  return ssrHtml(`<main>${esc(ssrLoading(null, {
    fallback: () => ssrHtml("<i>loading</i>"),
    children: () => ssrHtml(`<b>${esc(data() as string)}</b>`),
  }))}</main>`);
};
const out = await renderPage(page as never);
console.log("loader invocations:", calls);
console.log("html:", out.html);
console.log("seed data:", JSON.stringify(out.data));
