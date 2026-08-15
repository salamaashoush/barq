import { compileSource, fixtureSource, loadModule, type FixtureModule } from "./harness.ts"

/**
 * The hydration channel (`CODESIGN.md` §3.11, `SEMANTICS.md` H1–H4, H6).
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
 * silent-failure shape this milestone exists to close.
 */

export interface Compiled {
  /** The DOM module, compiled `hydratable`. */
  dom: FixtureModule
  /** The string module, compiled `hydratable`. */
  ssr: FixtureModule
  /** The emitted DOM source, for the H3 emission diff. */
  domCode: string
  /** The emitted string source. */
  ssrCode: string
}

export function compileBoth(source: string, tag: string, hydratable = true): [string, string] {
  return [
    compileSource(source, `${tag}.tsx`, { hydratable }),
    compileSource(source, `${tag}.tsx`, { ssr: true, hydratable }),
  ]
}

export async function compileFixture(name: string, hydratable = true): Promise<Compiled> {
  return compileText(fixtureSource(name), name, hydratable)
}

export async function compileText(
  source: string,
  tag: string,
  hydratable = true,
): Promise<Compiled> {
  const [domCode, ssrCode] = compileBoth(source, tag, hydratable)
  return {
    domCode,
    ssrCode,
    dom: await loadModule(domCode, `hy-dom-${tag}`),
    ssr: await loadModule(ssrCode, `hy-ssr-${tag}`),
  }
}

const SSR_HTML_BRAND = Symbol.for("barq.ssr.html")

/** The wire bytes: the string module's own output, with nothing normalised. */
export function wire(mod: FixtureModule): string {
  const value: unknown = (mod.default as unknown as (s: unknown) => unknown)(null)
  if (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[SSR_HTML_BRAND] === true
  ) {
    return (value as { t: string }).t
  }
  return typeof value === "string" ? value : ""
}

export function host(markup = ""): HTMLElement {
  const element = document.createElement("div")
  element.innerHTML = markup
  document.body.appendChild(element)
  return element
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
const NEWLINE_EATING = new Set(["pre", "textarea", "listing"])

// ---------------------------------------------------------------------------
// the node-identity census — M5's metamorphic channel, pointed at hydration
// ---------------------------------------------------------------------------

/**
 * Every node in `root`, in document order, as the object identities themselves.
 *
 * H1's falsification clause is "node-reuse percentage on a matching render MUST
 * be 100%", and a percentage needs a BEFORE and an AFTER of the same tree. This
 * is the before; `reuse` is the comparison.
 */
export function census(root: Node): Node[] {
  const out: Node[] = []
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      out.push(child)
      walk(child)
    }
  }
  walk(root)
  return out
}

export interface Reuse {
  /** Nodes present before hydration that are still in the tree afterwards. */
  kept: number
  /** Nodes present before hydration that hydration removed or replaced. */
  lost: number
  percent: number
  /** The first lost node, described, so a failure names the position. */
  firstLost: string | null
}

export function reuse(before: readonly Node[], root: Node): Reuse {
  const after = new Set<Node>(census(root))
  let kept = 0
  let firstLost: string | null = null
  for (const node of before) {
    if (after.has(node)) kept++
    else if (firstLost === null) firstLost = describe(node)
  }
  const lost = before.length - kept
  return {
    kept,
    lost,
    percent: before.length === 0 ? 100 : (kept / before.length) * 100,
    firstLost,
  }
}

export function describe(node: Node): string {
  if (node.nodeType === 8) return `<!--${(node as Comment).data}-->`
  if (node.nodeType === 3) return `text ${JSON.stringify((node as Text).data)}`
  return `<${node.nodeName.toLowerCase()}>`
}

// ---------------------------------------------------------------------------
// comparison
// ---------------------------------------------------------------------------

/**
 * The DOM as a string, with the claim scaffolding removed.
 *
 * The boundary comments are what a hydrated tree has and a cold one does not,
 * and they are the ONE difference that is allowed — they are the payload §11 Q4
 * agreed to pay. Everything else has to match, so they are stripped here and
 * counted separately by `payload`.
 */
export function shape(root: Node, canonicalizeLeadingNewlines = false): string {
  let out = ""
  let first = true
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === 8) {
      const data = (node as Comment).data
      if (data === "" || data.charAt(0) === "[" || data === "]") continue
      out += `<!--${data}-->`
      continue
    }
    if (node.nodeType === 3) {
      const data = (node as Text).data
      out += first && canonicalizeLeadingNewlines ? data.replace(/^\n+/, "") : data
      first = false
      continue
    }
    first = false
    const element = node as Element
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
      .join(" ")
    out += `<${element.localName}${attrs === "" ? "" : ` ${attrs}`}>`
    out += shape(element, NEWLINE_EATING.has(element.localName))
    out += `</${element.localName}>`
  }
  return out
}

/** Text runs fuse differently on the two paths; this is the comparison key. */
export function fused(root: Node): string {
  return shape(root).replaceAll(/\s+/g, " ")
}

// ---------------------------------------------------------------------------
// what one fixture's hydration produced
// ---------------------------------------------------------------------------

export interface Outcome {
  markup: string
  hydratedShape: string
  coldShape: string
  reuse: Reuse
  recovered: boolean
  mismatches: string[]
  effects: { hot: number; cold: number }
}

/**
 * Fixtures whose hydration DIVERGES, with the divergence written down.
 *
 * `SEMANTICS.md` §0.3's discipline, applied here: a registered row that starts
 * passing fails the suite as STALE, and an unregistered fixture that diverges
 * fails it outright. There is no skip and no tolerance — a row states the
 * `kinds` it must report, whether it had to recover, and the reuse floor it
 * must still clear, and it is held to all three.
 */
export interface KnownDivergence {
  /** Every `MismatchKind` the run must report, sorted, and no other. */
  kinds: string[]
  /** Whether the whole page had to be re-rendered on the client. */
  recovered: boolean
  /** The exact node-reuse percentage, rounded. Not a floor — an equality. */
  reuse: number
  /** The hydrated shape, when it is NOT the cold one. `null` when they match. */
  shape: string | null
  why: string
}

export const HYDRATION_KNOWN: Record<string, KnownDivergence> = {
  // ── the fallback element path: built, never claimed ────────────────────
  //
  // `createElement` is the shape a template cannot express — a spread, a
  // reshaping element, a `<template>` whose children live in `.content`, a
  // foreign namespace. The string backend serialised the whole subtree inline
  // as one hole's value, so there is no walk to claim it with, and `_$hole(null,
  // null, …)` says so at the call site. The hole rebuilds; nothing else does.
  mathml: {
    kinds: [],
    recovered: false,
    reuse: 27,
    shape: null,
    why: "<math> is built by createElement — P1 refuses a foreign-namespace root — so its subtree has no template walk to claim with",
  },
  "nested-template-element": {
    kinds: [],
    recovered: false,
    reuse: 80,
    shape: null,
    why: "a <template> element's children live in a DocumentFragment on `.content`, which `firstChild` cannot reach; it is built, and the <li> inside it with it",
  },
  "props-rest-spread": {
    kinds: [],
    recovered: false,
    reuse: 60,
    shape: null,
    why: "a rest pattern spread onto an intrinsic element is the createElement path by design (the fixture says so); the <span> it builds replaces the server's",
  },
  "select-option-multiple": {
    kinds: ["not-hydratable"],
    recovered: true,
    reuse: 0,
    shape: null,
    why: "the module ROOT is a <select> built by createElement, so the page claims nothing at all and degrades to a cold render — which is exactly today's behaviour",
  },
  "spread-static-mix": {
    kinds: ["not-hydratable"],
    recovered: true,
    reuse: 0,
    shape: null,
    why: "the module ROOT carries a spread, so it is createElement's; nothing is claimed and the page degrades to a cold render",
  },
  "escaping-adversarial": {
    kinds: [],
    recovered: false,
    reuse: 83,
    shape: null,
    why: "a <textarea> with a dynamic value is RAWTEXT — the tokenizer decodes nothing inside it, so `<!--[-->` there would be literal text and the element is built instead",
  },
  "pre-dynamic-leading-newline": {
    kinds: [],
    recovered: false,
    reuse: 80,
    shape:
      '<div class="doc"><pre class="hole">\nfirst line\nsecond line</pre><textarea class="field">draft</textarea></div>',
    why: "the same rawtext fact, plus the newline the parser eats: the rebuilt <textarea> loses the leading U+000A the server doubled for the parse, which happy-dom does not implement in either direction",
  },

  // ── a construct the flow pass REFUSED, reaching its primitive through an
  //    adapter that has no flags to forward ───────────────────────────────
  //
  // `components.ts`'s adapters call `branch`/`each` with `flags = 0`, so the
  // primitive is told nothing about `hydratable` and builds cold inside the
  // range the enclosing `insert` claimed. Detected, reported, and confined to
  // that range. Closing it means giving the adapters the flag, which is a
  // change to the fourteen constructs' own surface (M8's consumers touch the
  // same seam) rather than to the claim algorithm.
  dynamic: {
    kinds: ["not-hydratable"],
    recovered: false,
    reuse: 60,
    shape: null,
    why: "Dynamic is one of §3.4's three refusals: it reaches `branch` through the adapter, with no flags",
  },
  "control-flow-for-keyed-spread": {
    kinds: ["not-hydratable"],
    recovered: false,
    reuse: 27,
    shape: null,
    why: "a spread source is a shape the flow pass cannot read statically, so `For` reaches `each` through the adapter, with no flags",
  },
  "control-flow-await-suspense": {
    kinds: ["not-hydratable", "structure"],
    recovered: false,
    reuse: 60,
    shape: null,
    why: "Await reaches `branch` through the adapter (no flags), inside a Loading boundary that parks — both rows below",
  },

  // ── a boundary that parks, and a boundary that recovers ────────────────
  "flow-prop-eta-boundary": {
    kinds: [],
    recovered: false,
    reuse: 96,
    shape: null,
    why: "a Loading boundary parks its content in a detached fragment before revealing it, and a claimed node cannot be parked without leaving the document; its one range rebuilds",
  },
  "control-flow-error-boundary": {
    kinds: [],
    recovered: false,
    reuse: 43,
    shape: null,
    why: "the body throws on the client exactly as it did on the server, so the claim is spent by the attempt that failed and the fallback is built cold — E3's `try` and the claim are the same activation",
  },
  "control-flow-errored-loading": {
    kinds: ["range"],
    recovered: true,
    reuse: 0,
    shape: null,
    why: "a Loading boundary wrapping an Errored boundary whose body throws re-enters the region driver at a ROOT position after the claim has been spent; detected as a range that is not there, and the page degrades to a cold render",
  },

  // ── channels that write past the claim ─────────────────────────────────
  "inner-html-with-children": {
    kinds: [],
    recovered: false,
    reuse: 56,
    shape: null,
    why: "`innerHTML` plus a child means the served bytes are not the html the channel writes, so the skip-if-equal guard cannot fire and the write clears what the server sent",
  },
  "attribute-namespaces": {
    kinds: [],
    recovered: false,
    reuse: 100,
    shape:
      '<div><my-grid compact="" label="grid" rows="2"></my-grid><button data-beeps="0" type="button">beep</button></div>',
    why: "a custom element's `rows` resolves to the PROPERTY on the client and to an attribute on the server (there is no prototype chain on a string), so the served attribute survives beside the property — every node is claimed, and the difference is one attribute React leaves too",
  },
}

/**
 * The hydration channel's declared REACH — `SEMANTICS.md` §11's H family.
 *
 * Stated here rather than inside the suites so that `semantics.test.ts` can
 * compute what the whole oracle covers without importing one. A rule leaves this
 * list only when the check that can report it is deleted, which is the contract
 * `ownership.ts`'s `CHANNEL_RULES` and `addresses.ts`'s `ADDRESS_CHANNEL_RULES`
 * state for theirs.
 *
 * What each one is reported BY:
 *
 * | H1 | the node-identity census in `hydration.test.ts` — reuse must be 100%   |
 * | H2 | the branch-key comparison, and L6's "a branch index disagrees" row     |
 * | H3 | the emission diff, `hydratable` on against off, over the whole corpus  |
 * | H4 | L6's blast-radius column: `claim` / `local` / `cold` per mutation      |
 * | H6 | the focus-and-typed-value pair, plus the keystroke replay              |
 */
export const HYDRATION_CHANNEL_RULES: readonly string[] = Object.freeze([
  "H1",
  "H2",
  "H3",
  "H4",
  "H6",
])
