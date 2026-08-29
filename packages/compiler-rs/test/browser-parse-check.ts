/**
 * Browser-backed parse conformance for the emitted templates.
 *
 * `src/lower/parse.rs` decides which JSX shapes the HTML tree-construction
 * algorithm reproduces exactly as `createElement` does. Every refusal in it is a
 * claim about a real browser parser, and the differential harness runs against
 * happy-dom, whose tree construction is a subset — it does not foster-parent,
 * does not auto-close `<p>`, and does not run the adoption agency. So the
 * harness is structurally unable to falsify the predicate that protects it.
 *
 * This script is that second oracle. It runs three ways, all of them the same
 * code: as a CLI, from `test/browser.test.ts` inside `bun test`, and in CI.
 *
 *   bun test/browser-parse-check.ts [--chrome /path/to/chromium]
 *
 * It extracts every `_$template(...)` string the corpus emits, parses each one
 * in Chrome, and fails on three things: a template that parses to more than one
 * root (`template()` returns `content.firstChild`, so everything after the first
 * is LOST), a document-order tag sequence the parser moved, and a comment the
 * parser turned into text or dropped.
 *
 * It then runs a second, adversarial pass. The refusals in `lower/text.rs` and
 * `passes/fold.rs` say certain BYTES do not survive tree construction, and
 * happy-dom implements none of that rewriting — it hands NUL and CR straight
 * back, so the differential harness cannot see the difference either way. These
 * rows assert the rewriting really happens, which is what makes the refusals
 * necessary rather than superstition, and that the doubled newline for `<pre>`
 * survives the first-newline rule where a character reference does not.
 */

import { withChrome, type Page } from "./chrome.ts";
import {
  compileBrowserOnly,
  compileFixture,
  listBrowserOnlyFixtures,
  listFixtures,
} from "./harness.ts";

export interface Template {
  fixture: string;
  html: string;
}

export interface Failure extends Template {
  back: string;
  why: string;
}

/** `template(html, true)` wraps the markup in <svg xmlns>, so parse it that way. */
export function templateStrings(code: string): string[] {
  return [...code.matchAll(/_\$template\(`([\s\S]*?)`(?:,\s*(true))?\)/g)].map((m) =>
    m[2] ? `<svg xmlns="http://www.w3.org/2000/svg">${m[1]}</svg>` : m[1],
  );
}

export function corpus(): Template[] {
  const out: Template[] = [];
  for (const fixture of listFixtures()) {
    for (const html of templateStrings(compileFixture(fixture))) out.push({ fixture, html });
  }
  for (const fixture of listBrowserOnlyFixtures()) {
    for (const html of templateStrings(compileBrowserOnly(fixture))) {
      out.push({ fixture: `browser-only/${fixture}`, html });
    }
  }
  return out;
}

// Runs inside the page. Kept as a string because it is evaluated over CDP.
const CHECK = `(function (rows) {
  // Markup positions only. A regex over the whole string cannot tell a tag from
  // an attribute VALUE that spells one, and the round trip escapes the second
  // where it leaves the first alone — so \`data-markup="<x>"\` used to report a
  // moved tag sequence for markup the browser parsed identically both times.
  const tags = (s) => {
    const out = []
    let i = 0
    while (i < s.length) {
      if (s[i] !== "<") { i++; continue }
      if (s.startsWith("<!--", i)) { const e = s.indexOf("-->", i + 4); i = e === -1 ? s.length : e + 3; continue }
      const name = /^<([a-zA-Z][^\\s/>]*)/.exec(s.slice(i))
      if (!name) { i++; continue }
      out.push(name[1].toLowerCase())
      i += name[0].length
      let quote = ""
      while (i < s.length) {
        const ch = s[i]
        if (quote !== "") { if (ch === quote) quote = "" }
        else if (ch === '"' || ch === "'") quote = ch
        else if (ch === ">") { i++; break }
        i++
      }
    }
    return out
  }
  const comments = (node) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_COMMENT)
    let n = 0
    while (walker.nextNode()) n++
    return n
  }
  const bad = []
  for (const row of rows) {
    const host = document.createElement("template")
    host.innerHTML = row.html
    const back = host.innerHTML
    const why = []
    if (host.content.childNodes.length !== 1) why.push("parses to " + host.content.childNodes.length + " roots")
    if (tags(row.html).join(",") !== tags(back).join(",")) why.push("tag sequence moved")
    const declared = (row.html.match(/<!--/g) || []).length
    if (declared !== comments(host.content)) why.push("comment count " + declared + " -> " + comments(host.content))
    if (why.length) bad.push({ fixture: row.fixture, html: row.html, back, why: why.join("; ") })
  }
  return JSON.stringify({ checked: rows.length, bad })
})`;

/**
 * Bytes and shapes the compiler refuses to bake, with what a real parser makes
 * of them. `codes` is the codepoints the DOM hands back; `not` is what the
 * un-compiled path (`setAttribute` / `createTextNode`) would have produced, so
 * a row passes when the two DIFFER — the refusal is load-bearing. `is` is the
 * opposite: an exact value the parser must produce.
 */
const HAZARDS = [
  {
    name: "NUL in an attribute value",
    html: `<div id="a\u0000b"></div>`,
    read: "attr",
    not: "97,0,98",
  },
  { name: "NUL in text", html: `<div>x\u0000y</div>`, read: "text", not: "120,0,121" },
  {
    name: "NUL as a character reference",
    html: `<div id="a&#0;b"></div>`,
    read: "attr",
    not: "97,0,98",
  },
  {
    name: "CR in an attribute value",
    html: `<div id="a\rb"></div>`,
    read: "attr",
    not: "97,13,98",
  },
  { name: "CR in text", html: `<div>x\ry</div>`, read: "text", not: "120,13,121" },
  // O9. "in body" ignores ONE U+000A character token after these open tags, and
  // a character reference does NOT escape it — the tokenizer emits the same
  // token either way. Doubling the newline is the only thing that works, and
  // these three rows are why the compiler stopped emitting `&#10;`.
  { name: "pre eats a lone newline", html: `<pre>\na</pre>`, read: "text", is: "97" },
  {
    name: "pre eats &#10; exactly the same way",
    html: `<pre>&#10;a</pre>`,
    read: "text",
    is: "97",
  },
  { name: "pre keeps a DOUBLED newline", html: `<pre>\n\na</pre>`, read: "text", is: "10,97" },
  {
    name: "textarea keeps a DOUBLED newline",
    html: `<textarea>\n\na</textarea>`,
    read: "text",
    is: "10,97",
  },
  // What made the rule reachable again. A `<!---->` is a token, so the newline
  // after it is not the one the rule ignores — which is why an ELIDED marker in
  // front of a leading newline needs the doubling and a kept one does not.
  {
    name: "a marker protects the newline behind it",
    html: `<pre><!---->\na</pre>`,
    read: "text",
    is: "10,97",
  },
  {
    name: "listing eats a lone newline the same way",
    html: `<listing>\na</listing>`,
    read: "text",
    is: "97",
  },
  // The other half of O9, MEASURED rather than assumed, because it is the whole
  // of the `<pre>` byte divergence between an SSR string and a serialised DOM.
  //
  // The spec says a serialiser appends U+000A before a `<pre>` whose first text
  // child starts with one. Chrome does NOT — the round trip is lossy in the
  // serialiser's direction. So `<pre>\n\na</pre>` (the only spelling that yields
  // the text node `\na`, per the row above) and a serialised node tree carrying
  // that same text node differ by exactly one newline, on every engine.
  //
  // The compiler emits the parse-correct spelling on BOTH backends. A byte
  // comparison against `renderToString` therefore shows one extra newline and is
  // right to; a TREE comparison in a real browser shows none. DESIGN §5's
  // amendment states it, and these two rows are the measurement behind it.
  {
    name: "pre does NOT serialise the eaten newline back",
    html: `<pre>\n\na</pre>`,
    read: "serialize",
    is: `<pre>\na</pre>`,
  },
  {
    name: "a BUILT pre node serialises without doubling either",
    html: `\na`,
    read: "build",
    is: `<pre>\na</pre>`,
  },
] as const;

const HAZARD_CHECK = `(function (rows) {
  const bad = []
  for (const row of rows) {
    const host = document.createElement("template")
    if (row.read === "build") {
      const pre = document.createElement("pre")
      pre.appendChild(document.createTextNode(row.html))
      host.content.appendChild(pre)
    } else {
      host.innerHTML = row.html
    }
    if (row.read === "serialize" || row.read === "build") {
      const back = host.innerHTML
      if (back !== row.is) {
        bad.push({ fixture: row.name, html: row.html, back, why: "expected " + JSON.stringify(row.is) })
      }
      continue
    }
    const node = host.content.firstChild
    const value = row.read === "attr" ? node.getAttribute("id") : node.textContent
    const codes = [...value].map((c) => c.codePointAt(0)).join(",")
    if (row.is !== undefined && codes !== row.is) {
      bad.push({ fixture: row.name, html: row.html, back: codes, why: "expected " + row.is })
    }
    if (row.not !== undefined && codes === row.not) {
      bad.push({
        fixture: row.name,
        html: row.html,
        back: codes,
        why: "the parser handed these bytes back unchanged, so the compiler refusal is unnecessary",
      })
    }
  }
  return JSON.stringify({ checked: rows.length, bad })
})`;

export const HAZARD_ROWS = HAZARDS.length;

/**
 * The tree a template parses to, as one string. Kept as SOURCE so the identical
 * function runs in Chrome and in happy-dom — a signature computed by two
 * different implementations would compare two implementations, not two parsers.
 *
 * Text content is part of it on purpose: the divergence this exists to catch was
 * happy-dom splitting a text run on a bare `>` where Chrome keeps one node,
 * which puts a different node under `firstChild.nextSibling` in the two engines
 * and lets a wrong walk pass the fake-DOM half of the harness.
 */
const SHAPE = `(function (rows) {
  const sig = (node) => {
    if (node.nodeType === 3) return "#t" + JSON.stringify(node.data)
    if (node.nodeType === 8) return "#c" + JSON.stringify(node.data)
    const kids = Array.prototype.map.call(node.childNodes, sig).join(",")
    return node.nodeName.toLowerCase() + "[" + kids + "]"
  }
  return JSON.stringify(rows.map((row) => {
    const host = document.createElement("template")
    host.innerHTML = row.html
    return Array.prototype.map.call(host.content.childNodes, sig).join(",")
  }))
})`;

export interface ShapeDivergence extends Template {
  chrome: string;
  fake: string;
  /**
   * True when the two signatures differ ONLY by the leading newline of a
   * newline-eating element's first text child — the one tree-construction rule
   * happy-dom does not implement, measured directly by the three `<pre>` hazard
   * rows above. Everything else is a real disagreement about the tree.
   */
  leadingNewlineOnly: boolean;
  /**
   * True when they differ only by an EMPTY text node happy-dom creates inside
   * an empty raw-text element and Chrome does not. It materialises nothing and
   * serialises to nothing, so no walk and no comparison downstream can see it.
   */
  emptyTextOnly: boolean;
}

/**
 * A signature with that leading run removed. `#t"` directly after `[` is the
 * first child being a text node, which is exactly the position the parser's
 * rule is about, and the run is spelled `\n` because the signature is built
 * with `JSON.stringify`.
 *
 * An EMPTY text node goes with it, and for the same class of reason: happy-dom
 * creates one inside an empty raw-text element where Chrome creates no child at
 * all. It materialises nothing, contributes nothing to a sibling walk and
 * serialises to nothing, so a signature that counts it is comparing the two
 * parsers' bookkeeping rather than the tree.
 */
function withoutTheLeadingNewline(signature: string): string {
  return signature.replace(/((?:pre|textarea|listing)\[#t")(?:\\n)+/g, "$1");
}

/** The same signature with happy-dom's empty text nodes dropped. */
function withoutEmptyText(signature: string): string {
  return signature.replaceAll('#t""', "");
}

/**
 * Every emitted template, parsed in Chrome and in happy-dom, compared node for
 * node. `oracle.test.ts` — the effect bounds, the marker channel, the attribute
 * channel and `auditAnchors` — runs entirely on the fake parser, so a template
 * the two engines disagree about is a template on which those bounds measure a
 * tree the browser never builds.
 */
export async function checkParserAgreement(
  page: Page,
  rows: Template[],
): Promise<ShapeDivergence[]> {
  if (typeof document === "undefined") throw new Error("this comparison needs happy-dom");
  const value = await page.evaluate<string>(`${SHAPE}(${JSON.stringify(rows)})`);
  const chrome = JSON.parse(value ?? "[]") as string[];
  const fake = JSON.parse(
    (new Function(`return ${SHAPE}`)() as (rows: Template[]) => string)(rows),
  ) as string[];

  const out: ShapeDivergence[] = [];
  for (const [index, row] of rows.entries()) {
    if (chrome[index] === fake[index]) continue;
    out.push({
      ...row,
      chrome: chrome[index],
      fake: fake[index],
      leadingNewlineOnly:
        withoutTheLeadingNewline(chrome[index]) === withoutTheLeadingNewline(fake[index]),
      emptyTextOnly: withoutEmptyText(chrome[index]) === withoutEmptyText(fake[index]),
    });
  }
  return out;
}

/** Both passes, against an already-open page. Empty means every row held. */
export async function checkParseConformance(page: Page, rows: Template[]): Promise<Failure[]> {
  const run = async (fn: string, payload: unknown): Promise<Failure[]> => {
    const value = await page.evaluate<string>(`${fn}(${JSON.stringify(payload)})`);
    return (JSON.parse(value ?? '{"bad":[]}') as { bad: Failure[] }).bad;
  };
  return [...(await run(CHECK, rows)), ...(await run(HAZARD_CHECK, HAZARDS))];
}

export function reportParseConformance(rows: Template[], failures: Failure[]): void {
  console.log(
    `templates checked in a real browser: ${rows.length}, plus ${HAZARDS.length} hazard rows`,
  );
  if (failures.length === 0) {
    console.log("all parse to one root, with no tag moved and no comment lost");
    console.log("every refused byte is confirmed rewritten by the real parser");
    return;
  }
  for (const failure of failures) {
    console.error(
      `\n[${failure.why}] ${failure.fixture}\n  in : ${failure.html}\n  out: ${failure.back}`,
    );
  }
  console.error(`\n${failures.length} template(s) the browser reshapes`);
}

if (import.meta.main) {
  const rows = corpus();
  const failures = await withChrome((page) => checkParseConformance(page, rows));
  reportParseConformance(rows, failures);
  process.exit(failures.length === 0 ? 0 : 1);
}
