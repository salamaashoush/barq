import { compileSource, fixtureSource, loadModule, type FixtureModule } from "./harness.ts";

/**
 * The hydration channel.
 *
 * Three renderings of the same source, and the whole suite is the comparison
 * between them:
 *
 *  1. the SSR module compiled `hydratable`, whose STRING is the wire;
 *  2. the DOM module compiled `hydratable`, HYDRATED over that string;
 *  3. the DOM module compiled `hydratable`, rendered COLD into an empty host.
 *
 * (2) and (3) must produce the same DOM. (2) must additionally have taken the
 * server's nodes rather than replaced them, which is what the identity census
 * below measures — a claim that a markup comparison cannot make, because a
 * replaced node and a claimed node serialise identically. That is exactly the
 * silent failure hydration has to rule out.
 */

export interface Compiled {
  /** The DOM module, compiled `hydratable`. */
  dom: FixtureModule;
  /** The string module, compiled `hydratable`. */
  ssr: FixtureModule;
  /** The emitted DOM source, for the H3 emission diff. */
  domCode: string;
  /** The emitted string source. */
  ssrCode: string;
}

/**
 * `dev` is the DETECTION axis, and it is a parameter here for
 * the reason the axis exists: a production build and a development build of the
 * same source are two different emissions of both backends, and every claim
 * this file measures has to be measured on each of them.
 */
export function compileBoth(
  source: string,
  tag: string,
  hydratable = true,
  dev = false,
): [string, string] {
  return [
    compileSource(source, `${tag}.tsx`, { hydratable, dev }),
    compileSource(source, `${tag}.tsx`, { ssr: true, hydratable, dev }),
  ];
}

export async function compileFixture(
  name: string,
  hydratable = true,
  dev = false,
): Promise<Compiled> {
  return compileText(fixtureSource(name), name, hydratable, dev);
}

export async function compileText(
  source: string,
  tag: string,
  hydratable = true,
  dev = false,
): Promise<Compiled> {
  const [domCode, ssrCode] = compileBoth(source, tag, hydratable, dev);
  return {
    domCode,
    ssrCode,
    dom: await loadModule(domCode, `hy-dom-${tag}`),
    ssr: await loadModule(ssrCode, `hy-ssr-${tag}`),
  };
}

const SSR_HTML_BRAND = Symbol.for("barq.ssr.html");

/** The wire bytes: the string module's own output, with nothing normalised. */
export function wire(mod: FixtureModule): string {
  const value: unknown = (mod.default as unknown as (s: unknown) => unknown)(null);
  if (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[SSR_HTML_BRAND] === true
  ) {
    return (value as { t: string }).t;
  }
  return typeof value === "string" ? value : "";
}

/**
 * The tags whose first U+000A a conforming parser ignores.
 *
 * `test/ssr.ts` states this at length and canonicalises the leading run on BOTH
 * sides for the same reason: the string backend emits a newline of its own in
 * front of a hole precisely so the parser eats it, happy-dom implements neither
 * the parse rule nor the serialiser's half, and real Chrome eats it —
 * `browser-parse-check.ts` measures both directions. Comparing the byte here
 * would pin the fake DOM's gap as a hydration divergence, and the exact count is
 * pinned by `compile.rs`'s two O9 tests and the three Chrome rows behind them.
 */
const NEWLINE_EATING = new Set(["pre", "textarea", "listing"]);

export function host(markup = ""): HTMLElement {
  const element = document.createElement("div");
  element.innerHTML = markup;
  document.body.appendChild(element);
  return element;
}

// ---------------------------------------------------------------------------
// the node-identity census: the metamorphic channel, pointed at hydration
// ---------------------------------------------------------------------------

/**
 * Every node in `root`, in document order, as the object identities themselves.
 *
 * H1's falsification clause is "node-reuse percentage on a matching render MUST
 * be 100%", and a percentage needs a BEFORE and an AFTER of the same tree. This
 * is the before; `reuse` is the comparison.
 */
export function census(root: Node): Node[] {
  const out: Node[] = [];
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      out.push(child);
      walk(child);
    }
  };
  walk(root);
  return out;
}

export interface Reuse {
  /** Nodes present before hydration that are still in the tree afterwards. */
  kept: number;
  /** Nodes present before hydration that hydration removed or replaced. */
  lost: number;
  percent: number;
  /** The first lost node, described, so a failure names the position. */
  firstLost: string | null;
}

export function reuse(before: readonly Node[], root: Node): Reuse {
  const after = new Set<Node>(census(root));
  let kept = 0;
  let firstLost: string | null = null;
  for (const node of before) {
    if (after.has(node)) kept++;
    else if (firstLost === null) firstLost = describe(node);
  }
  const lost = before.length - kept;
  return {
    kept,
    lost,
    percent: before.length === 0 ? 100 : (kept / before.length) * 100,
    firstLost,
  };
}

export function describe(node: Node): string {
  if (node.nodeType === 8) return `<!--${(node as Comment).data}-->`;
  if (node.nodeType === 3) return `text ${JSON.stringify((node as Text).data)}`;
  return `<${node.nodeName.toLowerCase()}>`;
}

// ---------------------------------------------------------------------------
// comparison
// ---------------------------------------------------------------------------

/**
 * The DOM as a string, with the claim scaffolding removed.
 *
 * The boundary comments are what a hydrated tree has and a cold one does not,
 * and they are the ONE difference that is allowed: they are the payload the
 * wire agreed to pay. Everything else has to match, so they are stripped here
 * and counted separately by `payload`.
 */
export function shape(root: Node, canonicalizeLeadingNewlines = false): string {
  let out = "";
  let first = true;
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === 8) {
      const data = (node as Comment).data;
      if (data === "" || data.charAt(0) === "[" || data === "]") continue;
      out += `<!--${data}-->`;
      continue;
    }
    if (node.nodeType === 3) {
      const data = (node as Text).data;
      out += first && canonicalizeLeadingNewlines ? data.replace(/^\n+/, "") : data;
      first = false;
      continue;
    }
    first = false;
    const element = node as Element;
    // `class` is a SET, and the two paths reach it from different directions: a
    // hydrating element already carries the server's tokens and the class
    // channel adds its own to what is there, where a cold render writes them in
    // its own order. Comparing the order would pin the concatenation rather
    // than the meaning, so the tokens are sorted — and nothing else is, because
    // every other attribute IS its string.
    const attrs = Array.from(element.attributes)
      .map((a) =>
        a.name === "class"
          ? `class="${a.value.split(/\s+/).filter(Boolean).toSorted().join(" ")}"`
          : `${a.name}="${a.value}"`,
      )
      .toSorted()
      .join(" ");
    out += `<${element.localName}${attrs === "" ? "" : ` ${attrs}`}>`;
    out += shape(element, NEWLINE_EATING.has(element.localName));
    out += `</${element.localName}>`;
  }
  return out;
}

/** Text runs fuse differently on the two paths; this is the comparison key. */
export function fused(root: Node): string {
  return shape(root).replaceAll(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// what one fixture's hydration produced
// ---------------------------------------------------------------------------

export interface Outcome {
  markup: string;
  hydratedShape: string;
  coldShape: string;
  reuse: Reuse;
  recovered: boolean;
  mismatches: string[];
  effects: { hot: number; cold: number };
}

/**
 * Fixtures whose hydration DIVERGES, with the divergence written down.
 *
 * The pinning discipline, applied here: a registered row that starts
 * passing fails the suite as STALE, and an unregistered fixture that diverges
 * fails it outright. There is no skip and no tolerance — a row states the
 * `kinds` it must report, whether it had to recover, and the reuse floor it
 * must still clear, and it is held to all three.
 */
export interface KnownDivergence {
  /** Every `MismatchKind` the run must report, sorted, and no other. */
  kinds: string[];
  /** Whether the whole page had to be re-rendered on the client. */
  recovered: boolean;
  /** The exact node-reuse percentage, rounded. Not a floor — an equality. */
  reuse: number;
  /** The hydrated shape, when it is NOT the cold one. `null` when they match. */
  shape: string | null;
  why: string;
}

/**
 * `reuse` counts NODES, and boundary comments come off the wire wherever the
 * client can read a position's extent off its parent, so a row's percentage is
 * over the nodes the server actually sends.
 */
export const HYDRATION_KNOWN: Record<string, KnownDivergence> = {
  // ── raw text, where the tokenizer eats a newline nobody can see ────────
  //
  // A hole inside `<textarea>`/`<style>` is on the template path, so the
  // server writes the value's own bytes there and the client CLAIMS them. In a
  // browser that is exact: the serialiser doubles a leading U+000A because the
  // parser eats one, and the two cancel. happy-dom implements neither half, so
  // the claimed text is one newline longer than the value and the detector says
  // so — `text` here is the fake DOM's gap, measured, not a divergence the
  // compiler caused. `browser-parse-check.ts` is where the real answer is read.
  "escaping-adversarial": {
    kinds: ["text"],
    recovered: false,
    reuse: 100,
    shape: null,
    why: "happy-dom does not eat the newline the serialiser doubled in front of the <textarea> hole, so the claimed text is one U+000A longer than the value; the DOM the client ends up with is still the cold one, node for node",
  },
  "pre-dynamic-leading-newline": {
    kinds: ["text"],
    recovered: false,
    reuse: 100,
    shape:
      '<div class="doc"><pre class="hole">\nfirst line\nsecond line</pre><textarea class="field">draft</textarea></div>',
    why: "the same un-eaten newline in the one element that still pays for a hole comment: `<pre>` is ordinary parsing, so its `<!--[-->` is a real comment and the text behind it keeps the newline happy-dom did not eat",
  },

  // ── channels that write past the claim ─────────────────────────────────
  //
  // The content write and the children are two patches on one element, and the
  // server wrote them as one run of bytes. The claim covers that whole run, so
  // the write lands on nodes the insert then reconciles away. Closing it means
  // a claim that starts after the content the write owns, which is an addressing
  // change rather than a lowering one.
  "inner-html-with-children": {
    kinds: ["text"],
    recovered: false,
    reuse: 57,
    shape: '<section class="wrap"><div class="raw">replaced</div><span>after</span></section>',
    why: "`innerHTML` and a child are one claimed run on the wire: the write replaces what the server sent, and the insert then reconciles its claimed nodes over the write's own",
  },
  "attribute-namespaces": {
    kinds: [],
    recovered: false,
    reuse: 100,
    shape:
      '<div><my-grid compact="" label="grid" rows="2"></my-grid><button data-beeps="0" type="button">beep</button></div>',
    why: "a custom element's `rows` resolves to the PROPERTY on the client and to an attribute on the server (there is no prototype chain on a string), so the served attribute survives beside the property — every node is claimed, and the difference is one attribute React leaves too",
  },
};
