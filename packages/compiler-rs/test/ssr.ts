import { readFileSync } from "node:fs"
import { join } from "node:path"

import { compileSource, fixtureSource, loadModule, type FixtureModule } from "./harness.ts"

/**
 * The dual-render conformance seam (DESIGN §5, §10 M6).
 *
 * Two backends emit markup for the same IR. The DOM one builds nodes, so
 * escaping is something it gets for free — a text node cannot be parsed as a
 * tag and `setAttribute` cannot be parsed as a second attribute. The SSR one
 * emits a STRING, so every one of those safeties has to be reproduced by
 * escaping the right bytes at the right moment, and a byte it gets wrong is an
 * XSS hole on every page the compiler touches. Nothing but a comparison against
 * a path that cannot have the bug can find that.
 *
 * So there are three renderings of every fixture here, and the first two are
 * live today:
 *
 *  1. `renderToString` over the un-compiled `createElement` tree — the ORACLE.
 *     happy-dom builds real nodes and serialises them, so its markup is correct
 *     by construction and is the specification for the other two.
 *  2. `renderToString` over the COMPILED DOM module. Same serialiser, so a
 *     divergence here is the compiler's template bytes disagreeing with the
 *     runtime's node building — the compile-time half of the escaping rules,
 *     which the normalised DOM diff in `oracle.test.ts` deliberately throws
 *     away (it compares parsed trees, and `&amp;` and `&` parse the same).
 *  3. The compiled SSR module's own string. Pending until P8b lands; see
 *     `ssrStatus`, which detects it rather than being told.
 */

export interface SsrStatus {
  /**
   * `live` — the backend runs. `absent` — this build has no such backend, which
   * is a fact about the milestone. `broken` — the option is there and does not
   * produce a string backend, which is a BUG and must never be reported as
   * absence.
   */
  state: "live" | "absent" | "broken"
  /** Whether `ssr: true` compiles at all. */
  landed: boolean
  /** The compiler's refusal, while it does not. */
  refusal: string
  /** The emitted module for a trivial probe, once it does. */
  probe: string
}

const SSR_PROBE = 'const Probe = () => <section class="p">hi</section>;\nexport default Probe;\n'

function optionExists(name: string): boolean {
  try {
    const types = readFileSync(join(import.meta.dir, "..", "index.d.ts"), "utf8")
    return new RegExp(`^\\s*${name}\\?:`, "m").test(types)
  } catch {
    return false
  }
}

/**
 * Detection with a THIRD answer, on the pattern `differential.ts` states in
 * full.
 *
 * Two-valued detection is fail-open, and the mutation experiment walked into it:
 * a compiler mutant that offered statement splicing to the non-DOM backends made
 * the `ssr: true` compile PANIC on 106 of the 117 fixtures, and every consumer of
 * a two-valued `landed` classified that as "has not landed" and went green. The
 * worse the compiler got, the quieter the suite became. The other direction is
 * the same defect: napi ignores an option it does not know, so a build that
 * dropped `ssr` would emit DOM modules and a probe that merely COMPILED would
 * call them a string backend.
 *
 * So existence is asked separately from whether it works, and existence is read
 * off `index.d.ts`, which napi generates from the Rust option struct — a fact
 * about the build rather than a declaration anyone maintains. No option means
 * `absent`. An option that is there and throws, or that emits a module
 * indistinguishable from the DOM one, means `broken`.
 */
function detect(): SsrStatus {
  if (!optionExists("ssr")) {
    return {
      state: "absent",
      landed: false,
      refusal: "this build's option surface has no `ssr` — the string backend is not here yet",
      probe: "",
    }
  }
  let probe: string
  try {
    probe = compileSource(SSR_PROBE, "ssr-probe.tsx", { ssr: true })
  } catch (error) {
    const refusal = error instanceof Error ? error.message : String(error)
    return {
      state: "broken",
      landed: false,
      refusal: `the build has an \`ssr\` option and compiling with it failed: ${refusal}`,
      probe: "",
    }
  }
  if (probe === compileSource(SSR_PROBE, "ssr-probe.tsx")) {
    return {
      state: "broken",
      landed: false,
      refusal:
        "the build has an `ssr` option and emits the same module with and without it — a backend " +
        "that is ignored, not one that is missing",
      probe,
    }
  }
  return { state: "live", landed: true, refusal: "", probe }
}

/**
 * Detected, not declared. There is no constant to flip: the whole suite goes
 * live by itself on the first build where `ssr: true` stops being refused, so it
 * cannot sit asleep behind a boolean somebody forgot to change. What IS
 * asserted, always, is that the refusal is a real refusal — a compiler that
 * quietly emitted DOM code for `ssr: true` would make every claim below pass for
 * the wrong reason, and `ssr.test.ts` fails on exactly that.
 */
export const ssrStatus: SsrStatus = detect()

export function compileFixtureSsr(name: string): string {
  return compileSource(fixtureSource(name), `${name}.tsx`, { ssr: true })
}

export interface SsrRender {
  /** The markup, exactly as the path produced it. */
  html: string
  /** Whether the module's default export returned a string rather than a node. */
  string: boolean
}

/**
 * Render a loaded module to markup.
 *
 * A compiled SSR module returns a string and is used as it stands. Anything
 * else — a compiled DOM module, and the SSR fallback DESIGN §5 keeps for the
 * flow constructs that cannot be inlined — goes through the runtime's own
 * `renderToString`. Accepting both is the point: the fallback is a documented
 * strategy rather than a failure, and the markup it produces is held to exactly
 * the same comparison.
 */
export async function renderSsr(mod: FixtureModule): Promise<SsrRender> {
  // `@barqjs/server` is where the string backend and `renderToString` live: the
  // server runtime carries a serializer and a streaming loop, and a subpath of
  // the client package put keeping those out of a browser bundle in the
  // bundler's hands. It is the same module every compiled SSR module imports
  // its helpers from.
  const server = await import("@barqjs/server")
  // C1: a compiled module root takes its scope first, and `null` is the value
  // the compiler itself emits for one. `undefined` is what a MISSING argument
  // looks like, and `requireScope` throws on it precisely so a mistimed
  // construction cannot fall back to CURRENT.
  const value: unknown = (mod.default as unknown as (s: unknown) => unknown)(null)
  // A compiled SSR module returns branded markup, not a bare string — the brand
  // is what keeps user data (escaped) apart from compiler output (not), so
  // `typeof value === "string"` would classify every module as a fallback and
  // quietly turn "the string backend does no DOM work" into a claim about
  // nothing. `renderToString` accepts both shapes.
  return { html: server.renderToString(() => value as never), string: isSsrHtml(value) }
}

/**
 * Whether a module returned branded SSR markup rather than a DOM node.
 *
 * By the brand, rather than by the runtime's own predicate. `typeof value === "string"`
 * would not do: the brand is what tells markup the compiler produced (not
 * escaped) from user data (escaped), and getting that backwards is the XSS this
 * whole file is about. If the brand is ever renamed this returns false for
 * everything, and "a string-mode module does no DOM work" — which requires at
 * least forty of them — is what goes red.
 *
 * `Symbol.for`, spelled out rather than imported, so this is an independent
 * reading of the brand: a runtime that started trusting a plain property again
 * would still pass a check that just called the runtime's own predicate.
 */
const SSR_HTML_BRAND = Symbol.for("barq.ssr.html")

function isSsrHtml(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[SSR_HTML_BRAND] === true
  )
}

/**
 * The compiled DOM module, serialised by the runtime's own `renderToString`.
 *
 * This is the reference the string backend is held to. `CODESIGN.md` §6 retires
 * the un-compiled `createElement` path as an oracle, and the replacement here is
 * §6 L2's construction rather than a second implementation: one lowering, one
 * IR, two `Backend` impls. A new `Op` is a Rust compile error in both, so the
 * two sides cannot drift, and neither carries a decision the other does not.
 */
export async function renderSsrViaDom(name: string): Promise<SsrRender> {
  const code = compileSource(fixtureSource(name), `${name}.tsx`)
  return renderSsr(await loadModule(code, `ssr-dom-${name}`))
}

export async function renderSsrCompiled(name: string): Promise<SsrRender> {
  return renderSsr(await loadModule(compileFixtureSsr(name), `ssr-compiled-${name}`))
}

export async function renderSourceViaDom(source: string, tag: string): Promise<SsrRender> {
  return renderCode(compileSource(source, `${tag}.tsx`), `ssr-dom-${tag}`)
}

/** An already-emitted module, rendered as it stands — for the corruption checks. */
export async function renderCode(code: string, tag: string): Promise<SsrRender> {
  return renderSsr(await loadModule(code, tag))
}

export async function renderSourceViaSsr(source: string, tag: string): Promise<SsrRender> {
  return renderSsr(await loadModule(compileSource(source, `${tag}.tsx`, { ssr: true }), `ssr-${tag}`))
}

/**
 * The literal markup chunks of every `_$html(`…`)` in an emitted SSR module.
 *
 * Anchored on the helper CALL, the way `templateHtml` is anchored on
 * `_$template(`, and for the same reason: a fixture's doc comment is full of
 * backticks — `marker-literal-text` has ``data-note`` and ``<!---->`` in prose —
 * and a bare scan for backtick pairs reads those as markup the compiler emitted.
 * That turns "the fixture that renders the CHARACTERS of an anchor" into "the
 * fixture that emits an anchor", which is the exact confusion the fixture
 * exists to keep the harness out of.
 *
 * Interpolations are skipped rather than flattened, so `${esc(x)}` contributes
 * nothing and a nested template literal inside one is not mistaken for a chunk.
 */
export function ssrChunks(code: string): string[] {
  const out: string[] = []
  const opener = /_\$+html\(/g
  for (let match = opener.exec(code); match !== null; match = opener.exec(code)) {
    let i = match.index + match[0].length
    if (code[i] !== "`") continue
    i++
    let chunk = ""
    while (i < code.length) {
      const ch = code[i]
      if (ch === "\\") {
        chunk += code.slice(i, i + 2)
        i += 2
        continue
      }
      if (ch === "`") {
        out.push(chunk)
        break
      }
      if (ch === "$" && code[i + 1] === "{") {
        out.push(chunk)
        chunk = ""
        let depth = 1
        i += 2
        while (i < code.length && depth > 0) {
          if (code[i] === "{") depth++
          else if (code[i] === "}") depth--
          i++
        }
        continue
      }
      chunk += ch
      i++
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// comparison
// ---------------------------------------------------------------------------

const NODE_ELEMENT = 1
const NODE_TEXT = 3
const NODE_COMMENT = 8

export function parseFragment(html: string): DocumentFragment {
  const host = document.createElement("template")
  host.innerHTML = html
  eatTheFirstNewline(host.content)
  return host.content
}

/**
 * The one tree-construction rule happy-dom does not implement: "in body"
 * ignores ONE U+000A character token directly after `<pre>`, `<textarea>` and
 * `<listing>`. Real Chrome does — `browser-parse-check.ts`'s `pre eats a lone
 * newline` row measures it — and the string backend emits a newline of its own
 * in front of a hole for exactly that reason: it is the byte that gets eaten,
 * so the value behind it reaches the DOM whole. A harness that keeps it reads
 * every such value back one newline too long, which is a difference between two
 * PARSERS rather than between the two backends.
 *
 * Exactly one, and only off the first child: everything else in the element is
 * bytes the parser keeps, and reading them back is what this file is for.
 */
function eatTheFirstNewline(root: DocumentFragment): void {
  for (const element of Array.from(root.querySelectorAll("pre, textarea, listing"))) {
    const first = element.firstChild
    if (first === null || first.nodeType !== NODE_TEXT) continue
    const text = first as Text
    if (text.data.startsWith("\n")) text.data = text.data.slice(1)
  }
}

function dropComments(root: Node): void {
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === NODE_COMMENT) root.removeChild(child)
    else dropComments(child)
  }
}

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
])

/**
 * Attribute-sorted, text-fused re-serialisation.
 *
 * Attributes are sorted for the same reason `normalize.ts` sorts them: their
 * ORDER is a separate channel with its own comparison, and leaving it in this
 * one makes every ordering difference read as a markup difference. Text runs are
 * fused because a string concatenation produces one where node building produces
 * three, which is a difference between the two strategies rather than in what a
 * browser will show.
 */
/**
 * The tags whose first U+000A a conforming parser ignores, and the reason a
 * markup string and a SERIALISED DOM cannot be compared byte for byte here.
 *
 * The compiler doubles a leading newline (DESIGN O9) so that the parser's rule
 * leaves exactly one. The serialiser's half of the round trip is the one no
 * engine implements: the spec says to write the newline back, real Chrome does
 * not (`browser-parse-check.ts` measures both directions), and happy-dom
 * implements neither. So the oracle's `renderToString` of a `<pre>` whose text
 * is "\na" hands back `<pre>\na</pre>` — one newline short of the markup that
 * produced that text — while the SSR string is the doubled, parse-correct
 * spelling.
 *
 * Unlike the DOM comparison in `normalize.ts`, this one cannot be made
 * conditional on the host parser: the loss is in the SERIALISER and is present
 * on every engine. So the leading run is canonicalised on both sides, and what
 * pins the exact byte count instead is `compile.rs`'s two O9 tests over the
 * emitted template and the three Chrome rows behind them.
 */
const NEWLINE_EATING = new Set(["pre", "textarea", "listing"])

function serialize(root: Node, canonicalizeLeadingNewlines = false): string {
  let out = ""
  let text = ""
  const flush = (): void => {
    // Escaped, and this is not cosmetic. A text node whose DATA is
    // `<img src=x>` and a real `<img>` element are different documents, and
    // emitting the data raw makes them the same string — which would make this
    // whole comparison blind to exactly the under-escaping it exists to catch.
    // The detector in `ssr.test.ts` is what found that.
    out += text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    text = ""
  }
  for (const [index, node] of Array.from(root.childNodes).entries()) {
    if (node.nodeType === NODE_TEXT) {
      const data = (node as Text).data
      text +=
        index === 0 && canonicalizeLeadingNewlines ? data.replace(/^\n+/, "") : data
      continue
    }
    flush()
    if (node.nodeType !== NODE_ELEMENT) continue
    const el = node as Element
    const tag = el.localName
    const attrs = Array.from(el.attributes)
      .map((a) => `${a.name}="${a.value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`)
      .toSorted()
    out += `<${tag}${attrs.length > 0 ? ` ${attrs.join(" ")}` : ""}>`
    if (VOID.has(tag)) continue
    out += `${serialize(el, NEWLINE_EATING.has(tag))}</${tag}>`
  }
  flush()
  return out
}

/**
 * The markup string as a TREE.
 *
 * Comments go, on both sides. DESIGN §5 says `SkelNode::Marker` is skipped
 * entirely by the SSR serialiser — a `<!---->` is a DOM insert anchor and means
 * nothing on the wire — and the flow components the fallback path renders splice
 * their own NAMED marker pairs into the live DOM, which the oracle's
 * `innerHTML` therefore carries and an inlined `.map(…).join("")` never
 * produces. Comparing them would be comparing the two strategies rather than the
 * markup, so the channel is dropped here and asserted separately: `ssr.test.ts`
 * requires the compiled SSR string to carry no comment at all.
 */
export function sameTree(html: string): string {
  const content = parseFragment(html)
  dropComments(content)
  return serialize(content)
}

/** Comment data in a markup string, in document order. */
export function comments(html: string): string[] {
  const out: string[] = []
  const visit = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === NODE_COMMENT) out.push((child as Comment).data)
      else visit(child)
    }
  }
  visit(parseFragment(html))
  return out
}

// ---------------------------------------------------------------------------
// the escaping matrix
// ---------------------------------------------------------------------------

/**
 * One cell: a value, placed in a context that escapes it differently from every
 * other context.
 *
 * `read` is the safety property, and it is the whole point of the table: after
 * the markup has been PARSED again, the value has to still be the value. If it
 * is not, some of its bytes became structure — which is what an XSS is. Stating
 * it as a round trip rather than as "the output contains `&lt;`" makes the
 * assertion blind to which entity form the escaper chose and completely unblind
 * to the bug.
 */
export interface EscapeContext {
  name: string
  /** The probe's JSX. `expression` is a JS expression, brace-free. */
  jsx: (expression: string) => string
  /** Pull the value back out of the parsed markup. */
  read: (root: DocumentFragment) => string | null
}

export const ESCAPE_CONTEXTS: EscapeContext[] = [
  {
    name: "text child",
    jsx: (e) => `<div class="probe">{${e}}</div>`,
    read: (root) => root.querySelector(".probe")?.textContent ?? null,
  },
  {
    name: "text child between element siblings",
    jsx: (e) => `<div class="probe"><b>a</b>{${e}}<b>b</b></div>`,
    read: (root) => {
      const el = root.querySelector(".probe")
      if (!el) return null
      return Array.from(el.childNodes)
        .filter((n) => n.nodeType === NODE_TEXT)
        .map((n) => (n as Text).data)
        .join("")
    },
  },
  {
    name: "double-quoted attribute",
    jsx: (e) => `<div class="probe" title={${e}}></div>`,
    read: (root) => root.querySelector(".probe")?.getAttribute("title") ?? null,
  },
  {
    name: "data attribute",
    jsx: (e) => `<div class="probe" data-value={${e}}></div>`,
    read: (root) => root.querySelector(".probe")?.getAttribute("data-value") ?? null,
  },
  {
    name: "class attribute",
    jsx: (e) => `<div class={${e}} data-probe="yes"></div>`,
    read: (root) => root.querySelector("[data-probe]")?.getAttribute("class") ?? null,
  },
  {
    name: "pre, where whitespace is significant",
    jsx: (e) => `<pre class="probe">{${e}}</pre>`,
    read: (root) => root.querySelector(".probe")?.textContent ?? null,
  },
  {
    name: "textarea, escapable raw text",
    jsx: (e) => `<textarea class="probe">{${e}}</textarea>`,
    read: (root) => root.querySelector(".probe")?.textContent ?? null,
  },
  // A `<table><tr>` makes the parser open a `<tbody>` that `createElement`
  // never does, so P1 refuses the row IN PLACE and it becomes a template root of
  // its own — where "in template" insertion mode makes it legal. The cell below
  // therefore reaches the skeleton escapers by a longer route than every other
  // context here, through a second unit and a runtime `insert`.
  {
    name: "table cell text, which the parser reshapes",
    jsx: (e) => `<table><tr><td class="probe">{${e}}</td></tr></table>`,
    read: (root) => root.querySelector(".probe")?.textContent ?? null,
  },
  {
    name: "table cell attribute, which the parser reshapes",
    jsx: (e) => `<table><tr><td class="probe" title={${e}}></td></tr></table>`,
    read: (root) => root.querySelector(".probe")?.getAttribute("title") ?? null,
  },
]

/**
 * The values. Each is a byte sequence that means something to some parser, so a
 * context that fails to neutralise it produces structure instead of content.
 * Written with `\u` escapes rather than as literal characters, because half of
 * them are invisible and an editor that normalises one silently deletes a test.
 */
export const ESCAPE_VALUES: Array<[label: string, value: string]> = [
  ["a tag", '<img src=x onerror="alert(1)">'],
  ["a script element", "</p><script>alert(1)</script>"],
  ["an attribute break-out", '" onmouseover="alert(1)" data-x="'],
  ["a single-quoted break-out", "' onmouseover='alert(1)"],
  ["a bare ampersand", "a & b"],
  ["entities that must survive verbatim", "a &amp; b &#38; c &nbsp; d"],
  ["angle brackets", "< > <> ></>"],
  ["a comment opener and closer", "<!-- x --> ]]>"],
  ["a CDATA end and close-tag prefixes", "]]></div></pre></textarea></title>"],
  ["backtick and template interpolation", "` ${alert(1)} ` \\ \\` $ {}"],
  ["a lone backslash run", "\\ \\\\ \\\\\\"],
  ["astral characters", "\u{1D54F} \u{1F600} \u{20B9E}"],
  ["line and paragraph separators", "a\u2028b\u2029c"],
  ["invisible spacing characters", "a\u00a0b\u200bc\ufeffd"],
  ["quotes of both kinds", 'he said "hi" and \'bye\''],
  // Long enough that the runtime escaper probes with `indexOf` before it scans,
  // and hostile only in its last two bytes — so a probe that reported the wrong
  // offset, or a tail the scan forgot to append, shows up here and nowhere else
  // in this table. Every other value is short and escapes in its first few
  // characters.
  [
    "a long clean run that only turns hostile at the very end",
    `${"the quick brown fox jumps over the lazy dog and keeps going ".repeat(2)}&"<`,
  ],
]

/**
 * The probe module for one cell, with the value OPAQUE to the compiler.
 *
 * It reaches the JSX through a call, and that is the whole point: a
 * `const VALUE = "…"` read is a constant P3 folds into the template on both
 * backends, which made ninety of the hundred-odd "dynamic" cells byte-identical
 * duplicates of the folded half and left the RUNTIME escapers — `esc`, `attr`,
 * `rawText` — covered by one context out of seven. A call is never folded, so
 * every cell now really does arrive at runtime.
 */
export function escapeProbeSource(context: EscapeContext, value: string): string {
  return (
    `const VALUES = ${JSON.stringify([value])};\n` +
    "const hostile = () => VALUES[0];\n" +
    "export default function Probe() {\n" +
    `  return <div class="host">${context.jsx("hostile()")}</div>;\n` +
    "}\n"
  )
}

/** The same cell with the value inlined as a literal the compiler can fold. */
export function escapeStaticProbeSource(context: EscapeContext, value: string): string {
  return (
    "export default function Probe() {\n" +
    `  return <div class="host">${context.jsx(JSON.stringify(value))}</div>;\n` +
    "}\n"
  )
}

// ---------------------------------------------------------------------------
// the two contexts a VALUE position cannot reach
// ---------------------------------------------------------------------------

/**
 * Raw-text elements. Nothing inside is entity-decoded by the tokenizer, so
 * there is no escaping available at all — the only defence is neutralising the
 * sequence that ENDS the element, and the safety property is therefore "the
 * value never became structure" rather than "the value round-trips".
 *
 * The DOM path is not a specification here: `renderToString` serialises a text
 * node inside `<script>` verbatim, which reparses into a breakout, and happy-dom
 * escapes `<iframe>`/`<noscript>` content where a real browser does not. So
 * these cells are held to the property directly.
 */
export const RAW_TEXT_TAGS = ["script", "style"] as const

/**
 * The shared values plus the two that are only hostile INSIDE this element.
 *
 * `ESCAPE_VALUES` is a table of bytes that mean something to a parser reading a
 * text or attribute position; none of them ends a `<style>`, and the one that
 * carries `</script>` carries no ELEMENT after it, so it breaks out into script
 * text a tree comparison cannot see. The close sequence for the owning tag,
 * followed by real markup, is what makes the breakout observable — and the
 * `<!--` prefix is the script-data-escaped route to the same place.
 */
export function rawTextValues(tag: string): Array<[label: string, value: string]> {
  return [
    ...ESCAPE_VALUES,
    ["its own closing tag, then an element", `</${tag}><img src=x onerror="alert(1)">`],
    ["a comment opener, then its own closing tag", `<!--<script></${tag}><img src=y>`],
    ["its closing tag in mixed case", `</${tag.toUpperCase()} ><img src=z>`],
  ]
}

export function rawTextProbeSource(tag: string, value: string): string {
  return (
    `const VALUES = ${JSON.stringify([value])};\n` +
    "const hostile = () => VALUES[0];\n" +
    "export default function Probe() {\n" +
    `  return <div class="host"><${tag} class="probe">{hostile()}</${tag}></div>;\n` +
    "}\n"
  )
}

/**
 * The same, baked at COMPILE time. JSX text cannot hold a bare `<`, but
 * `&lt;/script&gt;` is ordinary JSX text and decodes to exactly the sequence
 * that ends the element — so the compiler's own raw-text bake has to neutralise
 * it too, and this is the shape that reaches it.
 */
export function rawTextBakedSource(tag: string, encoded: string): string {
  return (
    "export default function Probe() {\n" +
    `  return <div class="host"><${tag} class="probe">${encoded}</${tag}></div>;\n` +
    "}\n"
  )
}

/**
 * A hostile ATTRIBUTE NAME, which only a spread can produce: every other call
 * site passes a name the compiler wrote. `setAttribute` refuses an invalid name
 * with `InvalidCharacterError`, so the DOM path writes nothing, and a string
 * backend that wrote the bytes would turn one key into three attributes.
 */
export function attributeNameProbeSource(name: string): string {
  return (
    `const PROPS = { ${JSON.stringify(name)}: "1" };\n` +
    "export default function Probe() {\n" +
    '  return <div class="host"><div class="probe" {...PROPS}></div></div>;\n' +
    "}\n"
  )
}

/**
 * Markup the HTML parser reshapes, carrying LITERAL text and a LITERAL
 * attribute — the only shape that reaches `ssr.rs::bake_text` and
 * `bake_attribute`, the compiler's escapers for the JSX P1 refused. Everything
 * else in this file arrives either through the skeleton (P1 accepted) or as a
 * runtime value, so without these two functions the most security-critical
 * branch of the compiler has no test at all.
 *
 * The refusal has to be one no POSITION can undo. A row or a cell is refused
 * where it stands and then promoted to a template root of its own, where "in
 * template" insertion mode makes it legal — so it reaches the skeleton
 * escapers, not these. Non-whitespace text directly inside a `<table>` is
 * different in kind: the parser foster-parents it out of the element wherever
 * the element sits, so P1 refuses the table itself everywhere and the string
 * backend serialises it here.
 *
 * That fostering is also why `text` is read off `.host` rather than off the
 * table: a conforming parser moves the characters to the table's PARENT, and
 * the safety property — the value is still content, and still those characters
 * — holds either way.
 *
 * `source` is written with entity references because JSX text cannot hold a
 * bare `<`; `text`/`title` are what those references decode to, which is what
 * the value has to still be after the emitted markup is parsed again.
 */
export interface ReshapedProbe {
  name: string
  source: string
  text: string
  title: string
}

function reshapedSource(title: string, text: string): string {
  return (
    "export default function Probe() {\n" +
    `  return <div class="host"><table class="probe" title="${title}">${text}</table></div>;\n` +
    "}\n"
  )
}

export const RESHAPED_PROBES: ReshapedProbe[] = [
  {
    name: "a tag and an attribute break-out, entity-encoded in foster-parented text",
    source: reshapedSource(
      "a &quot; onmouseover=&quot;alert(1)&quot; b",
      "a &amp; b &lt;script&gt;alert(1)&lt;/script&gt; c",
    ),
    text: "a & b <script>alert(1)</script> c",
    title: 'a " onmouseover="alert(1)" b',
  },
  {
    name: "angle brackets and a bare ampersand in foster-parented text",
    source: reshapedSource("&lt;img src=x&gt; &amp;amp; &gt;", "&lt; &gt; &lt;&gt; &amp;amp;"),
    text: "< > <> &amp;",
    title: "<img src=x> &amp; >",
  },
  {
    name: "a comment opener and a CDATA end in foster-parented text",
    source: reshapedSource(
      "&lt;!-- x --&gt; ]]&gt;",
      "&lt;!-- x --&gt; ]]&gt; &lt;/td&gt;&lt;/tr&gt;",
    ),
    text: "<!-- x --> ]]> </td></tr>",
    title: "<!-- x --> ]]>",
  },
]
