/**
 * SSR head-to-head: barq's DOM-backed renderToString vs Solid's string
 * concatenation. Both render the same markup; the Solid side is written in the
 * shape its SSR compiler emits (`ssr` template chunks + `escape`).
 *
 * Run: bun run src/ssr-head-to-head.ts
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const barq = await import("@barqjs/core");
const solidServer = await import("solid-js/web");

type Row = { id: number; label: string };

function rows(n: number): Row[] {
  const out: Row[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = { id: i, label: `item ${i} <&>` };
  return out;
}

const DATA = rows(100);

// barq: components build real DOM, renderToString reads innerHTML
function barqPage(): unknown {
  return barq.createElement(
    "div",
    { class: "page" },
    barq.createElement("h1", null, "Title"),
    barq.createElement(
      "ul",
      null,
      ...DATA.map((row) =>
        barq.createElement("li", { class: "row", "data-id": String(row.id) }, row.label),
      ),
    ),
  );
}

// solid: the shape its SSR compiler emits
const ssr = solidServer.ssr as (chunks: string[], ...values: unknown[]) => unknown;
const escape = solidServer.escape as (v: unknown) => string;

function solidPage(): unknown {
  const items = DATA.map((row) =>
    ssr(
      ['<li class="row" data-id="', '">', "</li>"],
      escape(String(row.id)),
      escape(row.label),
    ),
  );
  return ssr(['<div class="page"><h1>Title</h1><ul>', "</ul></div>"], items as unknown);
}

function bench(name: string, fn: () => unknown, n: number): number {
  for (let i = 0; i < Math.min(n, 200); i++) fn();
  Bun.gc(true);
  let best = Number.POSITIVE_INFINITY;
  for (let r = 0; r < 7; r++) {
    const t = Bun.nanoseconds();
    for (let i = 0; i < n; i++) fn();
    const per = (Bun.nanoseconds() - t) / n;
    if (per < best) best = per;
  }
  console.log(`${name.padEnd(44)}${(best / 1000).toFixed(1).padStart(10)} µs`);
  return best;
}

// Correctness first: both must escape and produce equivalent markup
const barqHtml = barq.renderToString(() => barqPage() as never);
const solidHtml = solidServer.renderToString(() => solidPage() as never);
console.log("barq  html head:", `${barqHtml.slice(0, 90)}...`);
console.log("solid html head:", `${solidHtml.slice(0, 90)}...`);
// Solid leaves a bare `>` alone (harmless in text); barq escapes all three.
// Both neutralise the tag-opening characters, which is what matters.
console.log("barq  escapes < and &:", barqHtml.includes("&lt;&amp;"));
console.log("solid escapes < and &:", solidHtml.includes("&lt;&amp;"));
console.log();

const b = bench("barq renderToString (100 rows, via DOM)", () => barq.renderToString(() => barqPage() as never), 2000);
const s = bench("solid renderToString (100 rows, strings)", () => solidServer.renderToString(() => solidPage() as never), 2000);
console.log(`\nsolid is ${(b / s).toFixed(1)}x faster on this page`);
