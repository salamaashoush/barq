/**
 * The denominator for `matcher-head-to-head.ts`.
 *
 * A route match is worth generating code for only if it is a visible fraction of
 * what a server spends on a request. This measures the three things it competes
 * against on that path — a real compiled page through `renderToString`, the
 * `renderToString` envelope alone, and the `new URL(request.url)` every request
 * already pays — so the matcher's number is reported against something rather
 * than quoted on its own.
 *
 * The page is compiled by the REAL compiler with `ssr: true`, with
 * `serverSource` pointed at this repo's source so the emitted module resolves
 * without `@barqjs/server` being a dependency of this package. (It is not one:
 * `src/ssr-head-to-head.ts` has not run since the P0.5 package split moved the
 * string backend out of core, and fails with "Cannot find module
 * '@barqjs/server'". That is a separate, pre-existing breakage.)
 */

import { transform } from "@barqjs/compiler-rs";

import { loadModule } from "./compile.ts";
import { SUMMARY_HEADER, summarize, summaryLine } from "./stats.ts";
import { renderToString } from "../../server/src/index.ts";

const SERVER_SRC = new URL("../../server/src/index.ts", import.meta.url).pathname;
const CORE_SRC = new URL("../../core/src/index.ts", import.meta.url).pathname;

const PAGE = `
export default function Page(props) {
  return (
    <div class="page">
      <h1>{props.title}</h1>
      <ul>{props.rows.map((row) => <li id={row.id}>{row.name}</li>)}</ul>
    </div>
  );
}
`;

const emitted = transform(PAGE, {
  filename: "page.tsx",
  ssr: true,
  serverSource: SERVER_SRC,
  moduleSource: CORE_SRC,
});
const mod = await loadModule<{ default: (s: null, p: unknown) => unknown }>(emitted.code, "denominator-page");

const rows = Array.from({ length: 20 }, (_, i) => ({ id: i, name: `row ${i}` }));
const props = { title: "denominator", rows };

const BRAND = Symbol.for("barq.ssr.html");
const bare = (): { t: string } => {
  let out = "<div><ul>";
  for (const r of rows) out += `<li id="${r.id}">${r.name}</li>`;
  return { t: `${out}</ul></div>`, [BRAND]: true } as never;
};

function time(iterations: number, body: () => void): number[] {
  for (let i = 0; i < Math.min(iterations, 500); i++) body();
  const samples: number[] = [];
  for (let trial = 0; trial < 41; trial++) {
    const start = Bun.nanoseconds();
    for (let i = 0; i < iterations; i++) body();
    samples.push((Bun.nanoseconds() - start) / iterations);
  }
  return samples;
}

const compiled = time(200, () => {
  renderToString(() => mod.default(null, props) as never);
});
const envelope = time(200, () => {
  renderToString(bare as never);
});
const url = time(2000, () => {
  new URL("https://example.com/s0/u0/x/y?page=2");
});

console.log("what a route match competes against on one server request (ns/op)\n");
console.log(SUMMARY_HEADER);
console.log(summaryLine("renderToString, compiled 20-row", summarize(compiled)));
console.log(summaryLine("renderToString envelope only", summarize(envelope)));
console.log(summaryLine("new URL(request.url)", summarize(url)));
