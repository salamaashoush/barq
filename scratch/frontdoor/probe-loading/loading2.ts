/**
 * DECISIVE PROBE 2: can a `loading` boundary ever CLAIM, using real `template()`
 * on the client (the only thing that increments `claimed`)?
 *
 * HYDRATE (=4) is passed on BOTH sides, everywhere — the design's proposed fix
 * taken to its limit. No router involved.
 */
import { hydrate, template, branch as domBranch, boundary as domBoundary } from "@barqjs/core";
import { boundary as ssrBoundary, branch as ssrBranch, html as ssrHtml } from "@barqjs/server";

const HYDRATE = 1 << 2;
const P = template("<p>content</p>");
const I = template("<i>fallback</i>");

function run(name: string, html: string, client: (s: any) => unknown) {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  hydrate(client as any, container as any);
  const r = (hydrate as any).report;
  console.log(`\n--- ${name} ---`);
  console.log("  SSR :", JSON.stringify(html));
  console.log("  rep :", JSON.stringify({ claimed: r.claimed, ranges: r.ranges, built: r.built, recovered: r.recovered }));
  console.log("  miss:", JSON.stringify(r.mismatches));
  console.log("  DOM :", JSON.stringify(container.innerHTML));
  container.remove();
}

// 1. bare template, no region at all
run(
  "bare template (no region)",
  "<p>content</p>",
  (s: any) => P(),
);

// 2. branch, HYDRATE both sides
run(
  "branch (HYDRATE both)",
  (ssrBranch as any)(null, null, null, () => 0, [(s: any) => ssrHtml("<p>content</p>")], HYDRATE).t,
  (s: any) => domBranch(s, null, null, () => 0, [((sc: any) => P()) as any], HYDRATE),
);

// 3. error boundary, HYDRATE both sides
run(
  "error boundary (HYDRATE both)",
  (ssrBoundary as any)(null, null, null, "error", ((s: any) => ssrHtml("<i>fallback</i>")) as any, ((s: any) => ssrHtml("<p>content</p>")) as any, HYDRATE).t,
  (s: any) => domBoundary(s, null, null, "error", ((sc: any) => I()) as any, ((sc: any) => P()) as any, HYDRATE),
);

// 4. loading boundary that SETTLED on both sides, HYDRATE both sides
run(
  "loading boundary, settled (HYDRATE both)",
  (ssrBoundary as any)(null, null, null, "loading", ((s: any) => ssrHtml("<i>fallback</i>")) as any, ((s: any) => ssrHtml("<p>content</p>")) as any, HYDRATE).t,
  (s: any) => domBoundary(s, null, null, "loading", ((sc: any) => I()) as any, ((sc: any) => P()) as any, HYDRATE),
);

// 5. what the ROUTER actually builds: branch > loading > error > template
run(
  "router shape: branch>loading>error (HYDRATE everywhere)",
  (ssrBranch as any)(
    null, null, null, () => 0,
    [(s: any) =>
      (ssrBoundary as any)(s, null, null, "loading",
        ((s2: any) => ssrHtml("<i>fallback</i>")) as any,
        ((s2: any) => (ssrBoundary as any)(s2, null, null, "error",
          ((s3: any) => ssrHtml("<i>fallback</i>")) as any,
          ((s3: any) => ssrHtml("<p>content</p>")) as any, HYDRATE)) as any,
        HYDRATE)],
    HYDRATE,
  ).t,
  (s: any) => domBranch(s, null, null, () => 0, [((sc: any) =>
    domBoundary(sc, null, null, "loading",
      ((s2: any) => I()) as any,
      ((s2: any) => domBoundary(s2, null, null, "error",
        ((s3: any) => I()) as any,
        ((s3: any) => P()) as any, HYDRATE)) as any,
      HYDRATE)) as any], HYDRATE),
);
