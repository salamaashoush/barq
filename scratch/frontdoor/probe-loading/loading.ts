/**
 * DECISIVE PROBE: can a `loading` boundary EVER be hydrated (claimed)?
 *
 * No router involved. Pure core + server primitives, with HYDRATE (=4) passed on
 * BOTH sides everywhere, which is the design's proposed fix taken to its limit.
 */
import { boundary as domBoundary, branch as domBranch } from "@barqjs/core";
import { hydrate, element, flush } from "@barqjs/core";
import { boundary as ssrBoundary, html as ssrHtml, esc } from "@barqjs/server";

const HYDRATE = 1 << 2;

function report(name: string, r: any, html: string) {
  console.log(`\n--- ${name} ---`);
  console.log("SSR html:", JSON.stringify(html));
  console.log("report:", JSON.stringify({ claimed: r.claimed, ranges: r.ranges, built: r.built, recovered: r.recovered, mismatches: r.mismatches }));
}

// -------------------------------------------------- 1. a plain `branch`, HYDRATE both sides
{
  const ssr = ssrBoundary as any;
  // string side: branch
  const { branch: ssrBranch } = await import("@barqjs/server") as any;
  const html = ssrBranch(null, null, null, () => 0, [(s: any) => ssrHtml("<p>hello</p>")], HYDRATE).t;
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  hydrate(
    ((s: any) => domBranch(s, null, null, () => 0, [(sc: any) => { const p = document.createElement("p"); p.textContent = "hello"; return p; }], HYDRATE)) as any,
    container as any,
  );
  report("branch only (HYDRATE both)", (hydrate as any).report, html);
  container.remove();
}

// -------------------------------------------------- 2. a `loading` boundary that SETTLED, HYDRATE both sides
{
  const html = ssrBoundary(
    null, null, null, "loading",
    ((s: any) => ssrHtml("<i>fallback</i>")) as any,
    ((s: any) => ssrHtml("<p>content</p>")) as any,
    HYDRATE,
  ).t;
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  hydrate(
    ((s: any) => domBoundary(
      s, null, null, "loading",
      ((sc: any) => { const i = document.createElement("i"); i.textContent = "fallback"; return i; }) as any,
      ((sc: any) => { const p = document.createElement("p"); p.textContent = "content"; return p; }) as any,
      HYDRATE,
    )) as any,
    container as any,
  );
  report("loading boundary, settled (HYDRATE both)", (hydrate as any).report, html);
  console.log("DOM after:", container.innerHTML);
  container.remove();
}

// -------------------------------------------------- 3. an `error` boundary, HYDRATE both sides
{
  const html = ssrBoundary(
    null, null, null, "error",
    ((s: any) => ssrHtml("<em>boom</em>")) as any,
    ((s: any) => ssrHtml("<p>content</p>")) as any,
    HYDRATE,
  ).t;
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  hydrate(
    ((s: any) => domBoundary(
      s, null, null, "error",
      ((sc: any) => { const e = document.createElement("em"); e.textContent = "boom"; return e; }) as any,
      ((sc: any) => { const p = document.createElement("p"); p.textContent = "content"; return p; }) as any,
      HYDRATE,
    )) as any,
    container as any,
  );
  report("error boundary (HYDRATE both)", (hydrate as any).report, html);
  console.log("DOM after:", container.innerHTML);
  container.remove();
}
