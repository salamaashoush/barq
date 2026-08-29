import {
  OWNED,
  applyTags,
  captureHead,
  renderTags,
  resolveHead,
} from "../../packages/router/src/head.ts";
import type { MatchAssets } from "../../packages/router/src/head.ts";

const fresh = (headHtml: string): Document => {
  const d = document.implementation.createHTMLDocument("");
  d.head.innerHTML = headHtml;
  return d;
};
const show = (label: string, value: unknown) => console.log(`\n--- ${label} ---\n${value}`);

// A. nonce round-trip: server wrote a nonce, client re-applies the SAME tag.
{
  const m: MatchAssets[] = [{ headScripts: [{ children: "a=1" }] }];
  const d = fresh(renderTags(resolveHead(m, { nonce: "N0NCE" })));
  const before = d.head.querySelector("script");
  applyTags(resolveHead(m), d);
  show("A nonce round-trip", [
    "served: " + d.head.innerHTML,
    "same node reused? " + (before === d.head.querySelector("script")),
    "script count: " + d.querySelectorAll("script").length,
  ].join("\n"));
}

// B. an UNOWNED shell <title> plus an owned one.
{
  const m: MatchAssets[] = [{ meta: [{ title: "Home" }] }];
  const d = fresh("<title>My App</title>" + renderTags(resolveHead(m)));
  captureHead(d);
  const unowned = d.querySelector(`title:not([${OWNED}])`);
  applyTags(resolveHead([{ meta: [{ title: "About" }] }]), d);
  show("B unowned shell title + owned title", [
    "head: " + d.head.innerHTML,
    "title count: " + d.querySelectorAll("title").length,
    "document.title: " + JSON.stringify(d.title),
    "UNOWNED node was rewritten? " + JSON.stringify(unowned?.textContent),
  ].join("\n"));
}

// C. retracted title with no shell fallback -> does an unowned <title> appear?
{
  const d = fresh(renderTags(resolveHead([{ meta: [{ title: "Home" }] }])));
  captureHead(d);
  applyTags(resolveHead([{}]), d);
  const after1 = d.head.innerHTML;
  applyTags(resolveHead([{ meta: [{ title: "About" }] }]), d);
  show("C title -> none -> title", [
    "after retraction: " + after1,
    "  unowned titles: " + d.querySelectorAll(`title:not([${OWNED}])`).length,
    "after re-claim: " + d.head.innerHTML,
    "  title count: " + d.querySelectorAll("title").length,
    "  document.title: " + JSON.stringify(d.title),
  ].join("\n"));
}

// D. module-level `captured` across two documents.
{
  const d1 = fresh("<title>DOC-ONE</title>");
  captureHead(d1);
  const d2 = fresh("<title>DOC-TWO</title>");
  captureHead(d2);
  applyTags(resolveHead([{ meta: [{ title: "X" }] }]), d2);
  applyTags(resolveHead([{}]), d2);
  show("D `captured` is a module singleton", "d2's original was DOC-TWO; restored to " + JSON.stringify(d2.title));
}
