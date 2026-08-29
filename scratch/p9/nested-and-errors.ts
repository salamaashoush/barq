import { computed } from "@barqjs/core";
import { renderToStream } from "./server.ts";
import { esc, html as ssrHtml, ssrLoading } from "./ssr.ts";

const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms));
async function collect(s: ReadableStream<Uint8Array>): Promise<string[]> {
  const r = s.getReader();
  const d = new TextDecoder();
  const out: string[] = [];
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    out.push(d.decode(value));
  }
  return out;
}

// A: NESTED boundaries — outer settles slow, inner slower.
{
  const outer = computed(async () => { await tick(5); return "OUTER"; });
  const inner = computed(async () => { await tick(20); return "INNER"; });
  const page = (): unknown =>
    ssrHtml(`<main>${String(ssrLoading(null as never, {
      fallback: () => ssrHtml("<i>outer-skel</i>"),
      children: () => ssrHtml(`<b>${esc(outer())}</b>${String(ssrLoading(null as never, {
        fallback: () => ssrHtml("<i>inner-skel</i>"),
        children: () => ssrHtml(`<u>${esc(inner())}</u>`),
      }))}`),
    }))}</main>`);
  const all = (await collect(renderToStream(page as never, {}))).join("");
  console.log("=== A nested boundaries");
  console.log("  outer-skel in shell?", all.indexOf("outer-skel") >= 0);
  console.log("  OUTER delivered?", all.includes("OUTER"), "| INNER delivered?", all.includes("INNER"));
  console.log("  templates:", (all.match(/<template data-barq=/g) ?? []).length,
              "| swaps:", (all.match(/__BARQ_SWAP__\(/g) ?? []).length);
}

// B: a boundary whose body THROWS after the shell has flushed.
{
  const bad = computed(async () => { await tick(5); throw new Error("late boom"); });
  const page = (): unknown =>
    ssrHtml(`<main>${String(ssrLoading(null as never, {
      fallback: () => ssrHtml("<i>skel</i>"),
      children: () => ssrHtml(`<b>${esc(bad() as never)}</b>`),
    }))}</main>`);
  try {
    const parts = await collect(renderToStream(page as never, {}));
    const all = parts.join("");
    console.log("=== B post-shell throw");
    console.log("  stream completed, chunks:", parts.length);
    console.log("  document still closed?", all.includes("</main>"));
    console.log("  swap emitted?", all.includes("__BARQ_SWAP__("));
    console.log("  tail:", JSON.stringify(all.slice(-140)));
  } catch (e) {
    console.log("=== B post-shell throw -> STREAM REJECTED:", String(e).slice(0, 160));
  }
}

// C: the same throw, with an error boundary around it — the router's shape.
{
  const { ssrErrored } = await import("./ssr.ts");
  const bad = computed(async () => { await tick(5); throw new Error("late boom"); });
  const page = (): unknown =>
    ssrHtml(`<main>${String(ssrLoading(null as never, {
      fallback: () => ssrHtml("<i>skel</i>"),
      children: () => String(ssrErrored(null as never, {
        fallback: () => ssrHtml("<em>caught</em>"),
        children: () => ssrHtml(`<b>${esc(bad() as never)}</b>`),
      }, 0)),
    }))}</main>`);
  try {
    const all = (await collect(renderToStream(page as never, {}))).join("");
    console.log("=== C post-shell throw INSIDE an error boundary");
    console.log("  stream completed. fallback delivered?", all.includes("caught"));
  } catch (e) {
    console.log("=== C -> STREAM REJECTED:", String(e).slice(0, 120));
  }
}
