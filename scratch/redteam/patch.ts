import { HEAD_OWNER, applyHead, captureHead, renderHead, resolveHead } from "../../packages/router/src/head.ts";
type HD = import("../../packages/router/src/head.ts").HeadDescriptor;

const fresh = (headHtml: string): Document =>
  new DOMParser().parseFromString(
    `<!doctype html><html><head>${headHtml}</head><body></body></html>`,
    "text/html",
  );
const dump = (d: Document) => d.head.innerHTML;
const show = (l: string, v: unknown) => console.log(`\n--- ${l} ---\n${v}`);

// ============ 5a. NONCE: server wrote nonce, client patch re-creates without it
{
  const served = renderHead(resolveHead([{ script: [{ children: "a=1" }] }]), "N0NCE");
  const d = fresh(served);
  const before = d.head.querySelector("script");
  applyHead(resolveHead([{ script: [{ children: "a=1" }] }]), d);
  const after = d.head.querySelector("script");
  show("5a nonce round-trip (IDENTICAL head re-applied)", [
    "served : " + served,
    "after  : " + dump(d),
    "same node reused? " + (before === after),
  ].join("\n"));
}

// ============ 5b. raw-text script: escapeRawText breaks textContent equality
{
  const src = 'x("</script>")';
  const served = renderHead(resolveHead([{ script: [{ children: src }] }]));
  const d = fresh(served);
  const before = d.head.querySelector("script");
  applyHead(resolveHead([{ script: [{ children: src }] }]), d);
  show("5b escapeRawText round-trip", [
    "served       : " + served,
    "parsed text  : " + JSON.stringify(before?.textContent),
    "wanted text  : " + JSON.stringify(src),
    "same node?     " + (before === d.head.querySelector("script")),
    "after        : " + dump(d),
  ].join("\n"));
}

// ============ 5c. IDEMPOTENCE: apply the same head twice
{
  const chain: HD[] = [{ title: "T", meta: [{ name: "description", content: "d" }], link: [{ rel: "icon", href: "/f.png" }] }];
  const d = fresh(renderHead(resolveHead(chain)));
  const nodes0 = [...d.head.children];
  applyHead(resolveHead(chain), d);
  const nodes1 = [...d.head.children];
  applyHead(resolveHead(chain), d);
  const nodes2 = [...d.head.children];
  show("5c idempotence (hydration re-apply)", [
    "count " + nodes0.length + " -> " + nodes1.length + " -> " + nodes2.length,
    "all identical node refs? " + nodes0.every((n, i) => n === nodes1[i] && n === nodes2[i]),
    dump(d),
  ].join("\n"));
}

// ============ 5d. ORDINAL SHIFT: analytics script re-created (=> re-executed)
{
  const withTitle: HD[] = [{ title: "A", script: [{ src: "/analytics.js", async: true }] }];
  const noTitle: HD[]  = [{           script: [{ src: "/analytics.js", async: true }] }];
  const d = fresh(renderHead(resolveHead(withTitle)));
  const before = d.head.querySelector("script");
  applyHead(resolveHead(noTitle), d);
  const after = d.head.querySelector("script");
  show("5d ordinal shift -> script node identity", [
    "before id: " + before?.getAttribute(HEAD_OWNER),
    "after  id: " + after?.getAttribute(HEAD_OWNER),
    "SAME NODE (would NOT re-execute)? " + (before === after),
    dump(d),
  ].join("\n"));
}

// ============ 5e. server-rendered tag WITHOUT ownership (a hand-written shell title)
{
  const d = fresh(`<title>Kitchen Sink</title>` + renderHead(resolveHead([{ title: "Home" }])));
  captureHead(d);
  show("5e two titles, one owned one not — what does document.title read?", [
    "document.title BEFORE patch: " + JSON.stringify(d.title),
    "head: " + dump(d),
  ].join("\n"));
  applyHead(resolveHead([{ title: "About" }]), d);
  show("5e after patch", ["document.title: " + JSON.stringify(d.title), dump(d)].join("\n"));
}

// ============ 5f. NO shell title at all (kitchen-sink's actual document) -> retracted title
{
  const d = fresh(renderHead(resolveHead([{ title: "Home" }])));
  captureHead(d);
  applyHead(resolveHead([{ /* no title */ }]), d);
  show("5f retracted title with NO shell fallback", [
    "document.title: " + JSON.stringify(d.title),
    dump(d),
  ].join("\n"));
}

// ============ 5g. module-level `captured` leaks across documents
{
  const d1 = fresh(`<title>DOC-ONE</title>`);
  captureHead(d1);
  const d2 = fresh(`<title>DOC-TWO</title>`);
  captureHead(d2);
  applyHead(resolveHead([{ title: "X" }]), d2);
  applyHead(resolveHead([{}]), d2);
  show("5g module-level `captured` is a SINGLETON", [
    "d2 original title was DOC-TWO; restored to: " + JSON.stringify(d2.title),
  ].join("\n"));
}

// ============ 5h. duplicate-identity reuse: 3 og:image -> 2 og:image
{
  const three: HD[] = [{ meta: [
    { property: "og:image", content: "/1" },
    { property: "og:image", content: "/2" },
    { property: "og:image", content: "/3" },
  ]}];
  const two: HD[] = [{ meta: [
    { property: "og:image", content: "/1" },
    { property: "og:image", content: "/3" },
  ]}];
  const d = fresh(renderHead(resolveHead(three)));
  applyHead(resolveHead(two), d);
  show("5h shrinking a same-identity set", dump(d));
}

// ============ 5i. a meta whose attribute ORDER differs between server and client
{
  const d = fresh(`<meta ${HEAD_OWNER}="meta:name:description" content="d" name="description">`);
  applyHead(resolveHead([{ meta: [{ name: "description", content: "d" }] }]), d);
  show("5i attribute order insensitivity", dump(d));
}

// ============ 5j. boolean attrs round-trip
{
  const served = renderHead(resolveHead([{ script: [{ src: "/a.js", defer: true }] }]));
  const d = fresh(served);
  const before = d.head.querySelector("script");
  applyHead(resolveHead([{ script: [{ src: "/a.js", defer: true }] }]), d);
  show("5j boolean attr reuse", ["served: " + served, "same node? " + (before === d.head.querySelector("script")), dump(d)].join("\n"));
}

// ============ 5k. title -> no title -> title  (the orphan <title> the retraction creates)
{
  const d = fresh(renderHead(resolveHead([{ title: "Home" }])));
  captureHead(d);
  console.log("\n--- 5k title / no-title / title ---");
  console.log("0 head=" + d.head.innerHTML + "  document.title=" + JSON.stringify(d.title));
  applyHead(resolveHead([{}]), d);
  console.log("1 head=" + d.head.innerHTML + "  document.title=" + JSON.stringify(d.title));
  applyHead(resolveHead([{ title: "About" }]), d);
  console.log("2 head=" + d.head.innerHTML + "  document.title=" + JSON.stringify(d.title));
  console.log("  <title> count = " + d.querySelectorAll("title").length);
  applyHead(resolveHead([{ title: "Blog" }]), d);
  console.log("3 head=" + d.head.innerHTML + "  document.title=" + JSON.stringify(d.title));
  console.log("  <title> count = " + d.querySelectorAll("title").length);
}

// ============ 5l. shell ships a fallback <title> (the NON-kitchen-sink document)
{
  const d = fresh(`<title>My App</title>` + renderHead(resolveHead([{ title: "Home" }])));
  captureHead(d);
  console.log("\n--- 5l shell fallback title present ---");
  console.log("SSR bytes give crawler tree-order title: " + JSON.stringify(d.title));
  applyHead(resolveHead([{ title: "About" }]), d);
  console.log("after nav: head=" + d.head.innerHTML);
  console.log("  <title> count = " + d.querySelectorAll("title").length + "  document.title=" + JSON.stringify(d.title));
}

// ============ 5m. a PARTIALLY PARSED head (what B1's async-in-head entry would see)
{
  const served = renderHead(resolveHead([{ title: "Home", meta: [{ name: "description", content: "d" }], link: [{ rel: "icon", href: "/f.png" }] }]));
  // the parser has only reached the <title> when the async entry executes
  const partial = served.slice(0, served.indexOf("<meta"));
  const d = fresh(partial);
  captureHead(d);
  applyHead(resolveHead([{ title: "Home", meta: [{ name: "description", content: "d" }], link: [{ rel: "icon", href: "/f.png" }] }]), d);
  // ...now the parser catches up and appends the rest of the SERVER's bytes
  d.head.insertAdjacentHTML("beforeend", served.slice(served.indexOf("<meta")));
  console.log("\n--- 5m patch against a HALF-PARSED head, then the parser catches up ---");
  console.log(d.head.innerHTML);
  console.log("  meta[name=description] count = " + d.querySelectorAll('meta[name="description"]').length);
  console.log("  link[rel=icon] count = " + d.querySelectorAll('link[rel="icon"]').length);
}
