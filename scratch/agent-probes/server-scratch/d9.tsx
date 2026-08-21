import { computed } from "@barqjs/core";
import { renderToStream, renderPage } from "../src/server.ts";

const read = async (s: ReadableStream<Uint8Array>) => {
  const r = s.getReader(); const d = new TextDecoder(); let out = "";
  for (;;) { const { done, value } = await r.read(); if (done) break; out += d.decode(value, { stream: true }); }
  return out;
};

console.log("=== D9.1: does renderToStream seed a keyed computed when NO boundary parks? ===");
{
  // a computed that is ALREADY resolved synchronously (no park)
  const page = () => {
    const c = computed(() => 42, { key: "r:/x|{}" });
    return `<div>${c()}</div>`;
  };
  const html = await read(renderToStream(page as any));
  console.log("  contains 42 in markup:", html.includes(">42<") || html.includes("42"));
  console.log("  contains a seed script:", /__barq|hydrat|seed/i.test(html));
  console.log("  raw:", JSON.stringify(html.slice(0, 400)));
}

console.log("\n=== D9.2: an ASYNC keyed computed, NOT inside a Loading boundary ===");
{
  const page = () => {
    const c = computed(async () => { await new Promise((r) => setTimeout(r, 10)); return "SLOW"; }, { key: "r:/y|{}" });
    let v: unknown; try { v = c(); } catch (e: any) { v = `<threw ${e?.constructor?.name}>`; }
    return `<div>${String(v)}</div>`;
  };
  const html = await read(renderToStream(page as any));
  console.log("  html:", JSON.stringify(html.slice(0, 600)));
  console.log("  contains SLOW:", html.includes("SLOW"));
  console.log("  seed channel opened:", html.includes("script"));
}

console.log("\n=== D9.3: the null-bucket leak, two INTERLEAVED renders ===");
{
  // A promise entering inFlight OUTSIDE an async session -> null bucket.
  // Simulate "loader started before the render": create the computed and read it
  // with no active session, then render.
  const leaked = computed(async () => { await new Promise(r => setTimeout(r, 5)); return "RENDER-A-SECRET"; }, { key: "r:/a|{u:1}" });
  try { leaked(); } catch {}
  await new Promise((r) => setTimeout(r, 30));

  const pageB = () => {
    const own = computed(() => "B-own", { key: "r:/b|{}" });
    return `<div>${own()}</div>`;
  };
  const outB = await renderPage(pageB as any);
  console.log("  render B seed keys:", JSON.stringify(Object.keys(outB.data)));
  console.log("  render B data:", JSON.stringify(outB.data));
  console.log("  >>> LEAK:", JSON.stringify(outB.data).includes("RENDER-A-SECRET"));
}
