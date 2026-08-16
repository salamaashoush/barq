# `@barqjs/compiler-rs` — completion report, milestones 1 through 7

An optimizing JSX compiler in Rust on oxc, targeting the `@barqjs/core` fine-grained reactive
runtime. This document is the state of the project as measured on **2026-08-09**, on this machine,
from this committed tree. Every number in §1–§5 is the output of a command run while writing it;
§4's table carries exactly one italicised carried-forward row and says why, and §6 is by
construction the record of what milestone 7 itself measured. The appendix says precisely which is
which. Where a number disagrees with a previous milestone report, the number here is the one that
was measured.

Working tree: `main`, HEAD `962724b`, clean — all seven milestones are committed
(`7f81edd` M1–M4, `317589b` the M4 review, `c70d508` M5–M7, `962724b` the M7 review).
38 Rust source files, 14,486 lines. 110 fixtures plus one browser-only fixture.

---

## 1. Final state — every gate, with real output

### The crate

```
$ cargo fmt --check
FMT OK

$ touch src/lib.rs && cargo clippy --all-targets -- -D warnings
    Checking barq_compiler v0.1.0 (/home/sashoush/Workspace/barq/packages/compiler-rs)
    Finished `dev` profile in 0.47s
CLIPPY EXIT=0                                      (forced rebuild: "Checking" printed)

$ cargo test
test result: ok. 218 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 6.80s
   Doc-tests barq_compiler
test result: ok. 0 passed; 0 failed

$ touch src/lib.rs && bun run build          # napi build --platform --release
   Compiling barq_compiler v0.1.0
    Finished `release` profile [optimized]
-rwxr-xr-x 2416888 13:03:27 barq-compiler.linux-x64-gnu.node   (re-stamped: every JS number
                                                                below ran against this binary)
```

### The JavaScript suites

```
$ cd packages/compiler-rs && bun test
test/ssr.test.ts:
SSR conformance: P8b has landed — 110 fixtures compared live

 1274 pass
 1 todo
 0 fail
 220 snapshots, 6398 expect() calls
Ran 1275 tests across 7 files. [37.16s]

$ cd packages/core && bun test
 794 pass
 0 fail
 7374 expect() calls
Ran 794 tests across 28 files. [1410.00ms]

$ bun run test          (root)
@barqjs/testing     16 pass, 0 fail
@barqjs/core       794 pass, 0 fail
@barqjs/extra       87 pass, 0 fail
@barqjs/compiler-rs 1274 pass, 1 todo, 0 fail
@barqjs/compiler     8 pass, 0 fail          (the Vite plugin; the Babel plugin is deleted)
ROOT TEST EXIT=0

$ bun run ci            (root — oxlint --type-aware --deny-warnings + oxfmt --check)
Found 0 warnings and 0 errors.  Finished in 272ms on 61 files using 32 threads.
All matched files use the correct format.  Finished in 92ms on 70 files.
CI EXIT=0

$ bash .github/scripts/typecheck.sh
typecheck: 41 KNOWN error(s), unchanged.
TYPECHECK EXIT=0

$ bun install --frozen-lockfile
Checked 228 installs across 358 packages (no changes)
INSTALL EXIT=0
```

The one remaining `it.todo` is the pre-existing `dedup-identical-markup: zero patch calls across
both components` in `optimality.test.ts`. It is a stronger claim than target #6 currently delivers
(the fixture legitimately emits two `insert` calls for the two component children) and it is left
as a stated aspiration rather than deleted.

### The dual-render SSR conformance suite

```
$ bun test test/ssr.test.ts
SSR conformance: P8b has landed — 110 fixtures compared live
 722 pass
 0 fail
 3744 expect() calls
Ran 722 tests across 1 file. [1291.00ms]
```

### The browser suites (real Chrome, `google-chrome-stable`, over CDP)

```
$ bun test test/browser.test.ts
 10 pass, 0 fail, 27 expect() calls  [24.34s]

$ bun run test:browser:parse
templates checked in a real browser: 193, plus 13 hazard rows
all parse to one root, with no tag moved and no comment lost
every refused byte is confirmed rewritten by the real parser
PARSE EXIT=0

$ bun run test:browser:svg
ok  SVGElement.prototype.className has no setter (the bug is real)
ok  an SVG element's .className is an SVGAnimatedString, not a string
ok  assigning .className on an SVG element throws in module code
ok  setProp(svg, "class", …) lands on the class attribute
ok  setProp(svg, "classList", …) toggles keys additively on the class attribute
ok  the compiled fixture renders class=dot
ok  the compiled fixture renders stroke-width=1
ok  a signal write updates the SVG class
ok  a signal write updates a hyphenated SVG attribute
ok  the class goes back
all checks passed in a real browser
SVG EXIT=0

$ bun run test:browser:differential
corpus rendered in a real browser: 111 fixtures, 309 frames, 648 attribute lines
every frame is identical to the oracle
DIFF EXIT=0
```

### The four M6 security fixes, re-run verbatim

```
1. spreadAttrs hostile key -> threw: "x onload=alert(1) y" is not a valid attribute name.
                                     A spread whose keys are untrusted data cannot be
                                     written to markup.
2. isSsrHtml(forged) = false                    (forged = JSON.parse of the brand's shape)
2. esc(forged)       = "[object Object]"
3. rawText breakout  = "<\/script><img src=x onerror=alert(1)>"
4. esc(html(...))    = <b>ok</b>
4. attr(data-x)      = " data-x=\"a&quot;b&amp;c\""
5. after 2000 cached names, `bad name` -> threw  (the M7 name cache cannot launder an
                                                  invalid name, and is bounded)
```

### Packaging

```
$ npm pack --dry-run   (packages/compiler)
12 files, 7.1 kB packed, 27.1 kB unpacked
```

`bun.lock` contains 19 distinct `@babel/*` packages. **One is now direct**: M7's rewritten SSR
head-to-head drives `babel-preset-solid` so the Solid side of the comparison is a real compiler's
output rather than a hand transcription, which pulls `@babel/core` in as a `devDependency` of
`packages/benchmark`. That is the only `packages/*/package.json` reference to Babel; everything
else is transitive, and no shipped package depends on it.

### The Vite plugin end to end

```
$ cd packages/kitchen-sink && bunx vite build
✓ 57 modules transformed.
dist/assets/index-BQ9-RQcD.js  182.35 kB │ gzip: 53.47 kB   (0 warnings)
```

In the unminified build of the same app: **38 `_tmpl$` declarations, 476 `_tmpl$` references,
547 `_el$` declarations (1863 `_el$` occurrences), 375 `setProp`, 273 `insert(`,
11 `delegateEvents`**, and **zero** `createElement` from the JSX runtime — the nine matches in the
bundle are all `document.createElement` inside the runtime itself and inside `goober`.

Driving `barqVitePlugin().transform` directly on `kitchen-sink/src/App.tsx`:

```
ssr=false : templates=2  html=0  server-import=false  map=yes
ssr=true  : templates=0  html=3  server-import=true   map=yes
```

And a compiled SSR module really does run without a DOM:

```
$ bun run <compiled ssr module>          # no happy-dom registered
document defined: false
<ul class="list"><li>a</li><li>b</li></ul>
EXIT=0
```

---

## 2. The eleven targets

Ten of the eleven are delivered outright. Target #2 is delivered with one narrower claim than the
`it.todo` in the ledger aspires to. Nothing else is partial.

### #1 — Semantic reactivity via `oxc_semantic`, never name regexes — **DELIVERED**

`test/optimality.test.ts:343` `target 1 — semantic reactivity (never name regexes)`:

```js
it("static-only: a provably-static tree emits no thunk and no effect", () => {
  const code = compileFixtureBody("static-only")
  expect(templateHtml(code)[0]).toStartWith('<section class="card"')
  expect(code).toMatch(/return _tmpl\$\d+\(\)/)
  expect(count(code, /=>/)).toBe(0)
  expect(count(code, /renderEffect|_\$effect/)).toBe(0)
})
```

The negative half alone would pass on uncompiled JSX, which is why the two positive clauses come
first. The symbol-resolution half is proved by `handler-closure` / `handler-no-closure` in the same
block (a handler that closes over nothing is hoisted above the component; one that closes over a
signal is not) and, for M6, by
`codegen::ssr::tests::a_namespace_import_resolves_to_the_same_flow_as_a_named_one` — `<core.For>`
under `import * as core` is rewritten by `SymbolId`, and a local `const core = { For }` is not.

### #2 — Fully-static subtree: one `template()` clone, zero patch, zero effects — **DELIVERED, with one open aspiration**

`test/optimality.test.ts:380`:

```js
it("static-only: exactly one template() and zero patch calls", () => {
  expect(emittedCalls(code, "template")).toBe(1)
  expect(emittedCalls(code, "insert") + emittedCalls(code, "setProp") + emittedCalls(code, "spread")).toBe(0)
})
it("static-only: creates zero effects at runtime", async () => {
  expect(runtimeImports(result.compiled.code ?? "")).toEqual(["template"])
  expect(result.compiled.trace.created).toBe(0)
})
```

Corpus-wide: **94 of 110 fixtures** compile to a template with no effect and no anchor, accounting
for 166 of the 193 `template()` calls. The open aspiration is the one live `it.todo`:
`dedup-identical-markup: zero patch calls across both components`. That fixture inserts two
component results into a grid, so it emits two `insert` calls; making them zero needs component
inlining, which is not in scope for any of the seven milestones.

### #3 — Constant folding into the template HTML string — **DELIVERED**

`test/optimality.test.ts:407`:

```js
expect(templateHtml(code).join("\n")).toContain('class="btn btn--primary"')
expect(code).not.toContain("`${base}")
…
expect(templateHtml(code).join("\n")).toContain('style="color: red; font-weight: bold"')
expect(templateHtml(code), "one template, everything folded into it").toHaveLength(1)
```

M6 extended this into the one context where a style object can be folded. `test/ssr.test.ts`,
`a literal style object folds with the px rule dom.ts declares, key by key`, loops over
`CSS_NUMBER_PROPS` read out of `dom.ts` on disk and asserts, per key, that the bytes are in the
module and not in a runtime call:

```js
if (emittedCalls(code, "attr") !== 0) wrong.push(`${prop}: punted to the runtime`)
if (!ssrChunks(code).join("").includes("style=")) wrong.push(`${prop}: never reached a chunk`)
…
if (unit(want) !== unit(got)) wrong.push(`${prop}: runtime ${JSON.stringify(want)} vs SSR ${JSON.stringify(got)}`)
```

`<div style={{ "z-index": 2, width: 3, marginTop: 0, color: "red" }} />` compiles to
`_$html(\`<div style="z-index: 2; width: 3px; margin-top: 0; color: red;"></div>\`)`.

### #4 — One effect per element covering all its dynamic props — **DELIVERED**

`test/optimality.test.ts:431`:

```js
it("multi-prop-one-element: three dynamic props share a single effect", async () => {
  expect(result.compiled.trace.created).toBe(1)
  expect(result.oracle.trace.created).toBe(3)
})
```

Three effects become one, measured against the oracle at runtime rather than by reading the emit.
The boundary is asserted too — `class` is `STATEFUL_DIFF` and never joins a group
(`class-with-live-siblings`: compiled 2 effects, oracle 3) — and the corpus-wide rule
`no effect group spans two elements` runs over all 110 fixtures with a companion test that proves
it is a detector:

```js
const overMerged = code.replace('_$setProp(_el$1, "data-width"', '_$setProp(_el$2, "data-width"')
expect(groupTargets(overMerged)).toEqual([["_el$1", "_el$2"]])
```

### #5 — Walk elision — **DELIVERED**

`test/optimality.test.ts:510`. The assertions name the ROUTE rather than bounding the hop count,
because a module that addresses nothing satisfies every upper bound. Corpus-wide the compiled
output contains **124 walk steps in total** across 239 `_el$` declarations: 65 `.firstChild`,
33 `.lastChild`, 18 `.nextSibling`, 8 `.previousSibling` — i.e. the compiler reaches from the
nearest side, and 132 of the 239 bindings are declared without a step at all.

### #6 — Template dedup by content hash, module-wide — **DELIVERED**

`test/optimality.test.ts:584`:

```js
expect(emittedCalls(code, "template")).toBe(2)
expect(new Set(templateHtml(code)).size, "and no two of them are the same bytes").toBe(2)
```

`dedup-identical-markup` has three clone sites and two template declarations. Corpus-wide: 194
clone sites, 193 declarations — the whole corpus-wide surplus is that one fixture, because no two
*other* fixtures happen to share markup.

### #7 — Delegated events as `$$click` expando writes; hoist closure-free handlers — **DELIVERED**

`test/optimality.test.ts:592`:

```js
expect(code).toMatch(/\$\$click\s*=/)
expect(code).not.toContain("addEventListener")
…
expect(code).toMatch(/_el\$\d+\.\$\$click = bump/)
expect(code).toMatch(/_el\$\d+\.\$\$click = reset/)
expect(count(code, /delegateEvents\(/)).toBe(1)
```

The non-delegated boundary is asserted positively: `onMouseEnter`/`onFocus` do not bubble, so they
get a real `addEventListener` and the module emits no `delegateEvents` at all.

### #8 — Thunk elision for control-flow children with static bodies — **DELIVERED**

`test/optimality.test.ts:635`:

```js
expect(code).toMatch(/children:\s*_tmpl\$\d+\(\)/)
expect(code, "no thunk manufactured around the body").not.toMatch(/children:\s*\(/)
expect(code, "and nothing to bind it to").not.toMatch(/const _el\$/)
```

Both boundaries hold and both are behavioural rather than cosmetic: an author-written thunk
survives however static the body (`control-flow-show-static-body` toggles off and back on, and the
test asserts `new Set(identities).size > 1` — the oracle really built a second node and the
compiled path did too), and a `For` row body always keeps its thunk because `For` calls
`children(item, index)`.

### #9 — Marker elision — **DELIVERED**

`test/optimality.test.ts:695`. The strongest form is asserted, not just "no marker when nothing
follows":

```js
it("text-hole-followed: a following ELEMENT is the anchor, so no comment is baked", () => {
  expect(templateAnchors(code)).toBe(0)
  expect(templateHtml(code)).toEqual(['<div><span class="suffix">items</span></div>'])
  expect(code).toMatch(/_\$insert\(_el\$1, \(\) => count\(\), _el\$2\)/)
})
```

Corpus-wide, `no fixture in the corpus bakes an anchor that nothing inserts before` resolves every
emitted walk against the parsed template and requires `unused === 0` and `unresolved === 0`, with
`baked > 0` so the audit cannot pass by seeing nothing. The whole 110-fixture corpus bakes **14
anchors**. Two companion tests prove the audit is not blind: it throws on a module whose roots were
renamed, and it survives hygiene-shifted uids.

### #10 — SSR: static chunks escaped at compile time, one concatenation, zero DOM ops — **DELIVERED**

`test/ssr.test.ts`, `a string-mode module does no DOM work`:

```js
for (const helper of ["template", "insert", "setProp", "createElement", "spread"]) {
  expect(emittedCalls(code, helper), `${name} emitted a DOM ${helper}`).toBe(0)
}
expect(inlined.length, "the partition moved").toBe(CORPUS.length - SSR_FALLBACK.length)
```

The partition is pinned in both directions — `expect(fellBack.toSorted()).toEqual(SSR_FALLBACK.toSorted())`
against an explicit seven-name list — so a backend that fell back for everything cannot satisfy the
zero-DOM claim by having nothing to check. **103 of 110 fixtures** compile to pure string mode
(161 `_$html` literals, zero DOM ops); the other 7 fall back to the DOM backend and each carries a
diagnostic naming the component and `renderToString`.

Escaping is proved by a matrix of **9 contexts × 16 hostile values = 144 cells**, each asserted
against `renderToString` of the same value through `createElement` rather than a hand-written
expectation, plus 2 raw-text tags × 19 values, 16 attribute-name cells, and 3 P1-refused
(`<table>`-reshaped) probes. Every dynamic cell is required to emit a runtime escaper as an
equality, so a future constant fold cannot silently swallow the dynamic half — and since M7 the
dynamic half really is dynamic: the value is routed through a call P3 cannot fold, so all 144 cells
enter `escapeText`/`escapeAttribute` at runtime instead of 16 of them.

**What the matrix is evidence of, and what it is not.** Every cell is a *parse*: the value is read
back out of the markup and the two markups are compared as trees. That is the right question for
"did the value become structure", and it is blind to any two spellings that parse the same —
`&nbsp;` against a raw U+00A0, or a surrogate pair against the two halves it was written as. Both
of those mutations leave the whole matrix green. The byte-level evidence for the escapers'
*character set* is elsewhere and is named where it is used: `packages/core/src/ssr.test.ts`'s
boundary corpus, and one row in `test/ssr.test.ts` ("the escapers' own BYTES, where a tree
comparison is blind") that asserts the rendered bytes for U+00A0 and an astral pair in both a text
and an attribute position, on both the runtime and the compile-time escaper.

### #11 — Compile throughput as a feature — **DELIVERED**

`test/optimality.test.ts:814`. The budget test first proves a real compile happened, because an
identity transform is instantaneous:

```js
expect(emitted.filter((code, i) => code === fixtureSource(names[i])),
       "a fixture that came back unchanged was not compiled").toEqual([])
```

Numbers in §4.

---

## 3. Measured output quality

**Everything in this section is Tier 1** — Node, Bun, happy-dom, a stub DOM. `CODESIGN.md` §0.7 is
the standing rule that governs it: Tier 1 iterates, **Tier 2 adjudicates**, and a Tier-1 win is
provisional until a real browser confirms it. M7c ran this project's headline claims through the
Tier-2 lane (`packages/benchmark/src/tier2/`, `bun run bench:tier2`) and three of them died, one was
inverted, and one real algorithmic defect turned up that no Tier-1 suite could see. The two summaries
worth carrying here before reading any ratio below:

- **js-framework-benchmark, real Chrome, trace-derived durations, 10 iterations a row.** Seven of
  nine rows within 5% on total, because paint dominates them; the **`js` half is 1.2–2.3x Solid's on
  every one of the nine**; `clear rows` 1.292x (p=4.1e-2) and `select row` 1.513x (p=2.6e-1, and
  0.452x on a second run) are where it shows through; **run memory at 1,000 rows 2.73–2.75 MB against
  1.76 MB**.
- **js-reactivity-benchmark, real Chrome.** 7 of 9 kairo rows and 3 of 3 sBench rows to barq, and
  **cellx1000 55.7x / cellx2500 186.6x against** it — propagation is superlinear in graph depth
  (`CODESIGN.md` §9.1, F1). The eleven-case head-to-head this project wrote cannot see it: its
  deepest chain is five.

### DOM head to head against Solid

`packages/benchmark/src/dom-head-to-head.ts`, run as `bun run bench:dom` (which is
`bun --conditions=browser run src/dom-head-to-head.ts`). The condition matters: without it
`solid-js/web` resolves to its *server* build, Solid's effects never run, and the comparison is
meaningless — before M7 the file's own header told you to run it without the flag, and it threw
`Client-only API called on the server side` at line 48. Two fresh runs:

| case | barq ns | solid ns | ratio | (2nd run) |
|---|---|---|---|---|
| template: clone static tree | 1664 | 1676 | 1.01x faster | 1.00x SLOWER |
| insert: single text hole, first render | 942 | 1042 | **1.11x faster** | 1.15x faster |
| insert: text hole update | 135 | 186 | **1.38x faster** | 1.32x faster |
| list: create 100 rows | 181575 | 180600 | 1.01x SLOWER | 1.00x SLOWER |
| list: swap 2 of 200 rows | 7062 | 7535 | **1.07x faster** | 1.05x faster |
| list: replace all 100 rows | 101246 | 104488 | 1.03x faster | 1.02x SLOWER |
| prop: class update | 261 | 321 | **1.23x faster** | 1.37x faster |

```
DOM nodes produced for one dynamic text hole (<span>{x}</span>):
  barq : 1  ->  hi
  solid: 1  ->  hi
```

Node count per text hole matches Solid at 1. Four rows are a real win in both runs
(`insert` ×2, `swap`, `class update`). **Three rows straddle 1.0 and change sign between runs** —
`clone static tree`, `create 100 rows`, `replace all 100 rows` — and the file now prints a footer
saying exactly that, because it reports min-of-7 *within one process*, which awards the win to
whichever side dodged a GC pause. Do not quote any ratio here inside about 5% without the spread.

`replace all 100 rows` in particular was reported as a 1–3% loss for two milestones. It is not.
`packages/benchmark/src/dom-replace-all.ts` (`bun run bench:replace-all --processes=5`) is a paired
harness with A/B order flipped every trial and a CONTROL case that runs *identical* code on both
sides; measured here:

| case | min | median | max | runs > 1 |
|---|---|---|---|---|
| CONTROL: identical work | 0.9903 | **1.0003** | 1.0081 | 3/5 |
| A: replace all, as reported | 0.9172 | **0.9454** | 0.9719 | **0/5** |
| B: replace all, pre-built rows | 0.9194 | 0.9561 | 0.9737 | 0/5 |
| C: reconciler only (`mapArray`, zero DOM) | 0.7197 | 0.7457 | 0.9834 | 0/5 |
| D: `insert()` patch only | 0.9899 | 1.0020 | 1.0110 | 3/5 |

The CONTROL at 1.0003 with 3/5 above 1 is what makes the rest readable: the harness is unbiased to
~0.3%, and case A sits 15x that distance below 1 and never crosses it. barq is at parity to ~5%
faster on that case. The decomposition also locates it: the win is in the reconciler (C), not in
the DOM patch (D, parity), and the full case dilutes it with allocation.

The benchmark hand-writes both frameworks' emitted shapes, so `bun run bench:shape` was added to
audit that by hand-writing nothing: it compiles the equivalent JSX through **both real compilers**,
diffs the runtime-helper sets against what the benchmark calls, and runs a liveness table that
throws if any binding stops being reactive. Its findings are recorded in §5.4 — two small biases,
both against barq.

### SSR head to head against Solid

`packages/benchmark/src/ssr-head-to-head.ts`, `bun run bench:ssr`. Since M7 it compiles one shared
JSX source through **both real compilers** — `@barqjs/compiler-rs` with `ssr: true` and
`babel-preset-solid` with `generate: "ssr"` — writes each emitted module to disk, imports it, and
times *that*. It prints both emits and throws if the two pages differ by more than Solid's one
unescaped `>`, so the timings cannot be compared across different work.

What it compiles to, verbatim from this run:

```js
// barq, ssr: true
import { esc as _$esc, html as _$html, attrLit as _$attrLit } from "@barqjs/core/server";
export default function Page(props) {
  return _$html(`<div class="page"><h1>Title</h1><ul>${_$esc(props.rows.map((row) =>
    _$html(`<li class="row"${_$attrLit("data-id", String(row.id))}>${_$esc(row.label)}</li>`)))}</ul></div>`);
}
```

51 trials × 100 iterations, interleaved round-robin with a rotating start, µs per render:

| 100-row page, `renderToString` envelope | min | p25 | median | p75 | sd |
|---|---:|---:|---:|---:|---:|
| barq compiled | 3.99 | 4.38 | **4.67** | 5.21 | 4.72 |
| solid compiled | 8.02 | 8.74 | **9.24** | 10.05 | 2.13 |
| barq UNCOMPILED (`createElement` + `renderToString`) | 150.64 | 166.18 | **177.03** | 192.35 | 16.06 |

- **Solid is 1.91x slower than barq** (ratio p25–p75 1.824–2.079, Wilcoxon p = 1.2e-7).
- **The compiler is worth 37.8x** against the uncompiled path it replaces (p25–p75 34.6–40.5).
- Template assembly only, no root scope: barq 4.89 µs vs Solid 8.25 µs, 1.79x.
- Fully static page: both fold to one constant, ~2–3 ns/render. Printed, but labelled
  `AT TIMER RESOLUTION` — it shows the shape, it does not rank the two.

**State that ratio as an envelope, not a point.** Four readings of this benchmark across the M7
session and this one: 1.67x, 1.88x, 1.91x, 1.98x, with one run on a different box at 2.21–2.49x.
The sign is what reproduces everywhere; the magnitude is machine- and run-dependent.

**What this replaced, and why the old headline was wrong.** Until M7 this file timed
`barq.renderToString` over a `createElement` tree — the *uncompiled* path — against Solid's
compiled `ssr()` shape, and printed "solid is 18.2x faster on this page". That was a true statement
about the path target #10 *replaced*, published inside the project's own repo as if it described
target #10. On the compiled path the pre-G1 measurement was Solid **1.66–1.94x faster**; after the
escaper rewrite it is barq **1.91x faster**. The byte-equality assertion passes across both, which
is what proves G1 changed no output.

### Corpus-wide structural wins, before and after

"Before" is the same compiler with `templates: false`, which is the honest uncompiled baseline —
every element goes through `createElement`. All three columns are the same 110 fixtures.

| | BEFORE (`templates: false`) | AFTER (DOM backend) | SSR (`ssr: true`) |
|---|---|---|---|
| emitted bytes, whole corpus | 137,133 | 156,518 | 137,889 |
| `createElement()` calls | **363** | **13** | **0** |
| `template()` calls | 0 | **193** | 21 |
| `_el$` declarations | 0 | 239 | 14 |
| anchors / `<!---->` markers | 0 | **14** | 2 |
| `renderEffect()` calls | 0 | 5 | 0 |
| `insert()` calls | 0 | 152 | 14 |
| `setProp()` + `spread()` | 0 | 71 | 2 |
| IIFEs | 0 | **6** | 1 |
| `_$html()` literals | 0 | 0 | **161** |
| fixtures: template + zero patch | 0 | 12 | — |

Reading of that table:

- **363 `createElement` calls become 193 `template()` clones and 13 residual calls.** The 13 are the
  component and fallback sites the target list never claimed to remove.
- **14 markers for the whole corpus**, unchanged across four new fixtures. Target #9 works: the great
  majority of holes anchor against a node that already exists.
- **5 `renderEffect` calls corpus-wide.** Target #4's fusion only emits a grouped effect where two
  or more live props are contiguous on one element; the rest reach `setProp` unwrapped, which is
  cheaper still.
- **6 IIFEs.** Target #8 removed the rest.
- **Emitted bytes go UP, by 14%.** The compiled module is larger than the uncompiled one and always
  will be — it trades source bytes for a template string and precomputed addressing. What shrinks is
  work at runtime, not the bundle. Post-bundling and minification the kitchen-sink app is 182 kB /
  53 kB gzipped.
- **SSR is 12% smaller than the DOM emit and has no DOM ops at all** on 103 of the 110.

---

## 4. Compile throughput

Budget: 1 ms for a typical component file. Three consecutive runs of `test/throughput.test.ts`
on the committed tree:

```
median  : 0.0093 / 0.0094 / 0.0093 ms/compile
slowest : 0.0248 / 0.0238 / 0.0236 ms/compile   (dashboard-composite)
corpus  : 110 fixtures, 128,855 bytes, 1.079 / 1.087 / 1.073 ms total, 119.4 / 118.6 / 120.1 MB/s
typical component file: 3335 bytes, 113 lines, 0.0319 / 0.0316 / 0.0303 ms/compile
guard-thread path: 127,077 bytes, 1.846 / 1.812 / 1.823 ms/compile, ~67 MB/s
pass stage: 0.0238 ms parse-only, 0.0324 ms compiled, 1.36x (worst of the three)
```

The corpus is 7.5% larger than it was at M6 and the throughput is 20% higher.

### The M1 → M7 trend

Historical self-reported figures were taken against different corpora and a smaller "typical
component file", so they are not comparable to each other. For a real trend the **committed M1–M4
binary (`317589b`)** was rebuilt from a clean `git archive`, loaded alongside the current binary in
one process, and both were run over the **identical current input** — interleaved, best of 15
rounds × 50 iterations, both orders:

| | typical component file (3335 B) | 110-fixture corpus (128,855 B) |
|---|---|---|
| M1–M4 binary (`317589b`) | 0.0328 ms | 0.0105 ms/compile, 111.2 MB/s |
| M6 binary, before the G6 work | *0.0355 ms* | *0.0114 ms/compile*, *99.4 MB/s* |
| **M7 binary (`962724b`)** | **0.0302 ms** | **0.0097 ms/compile, 120.6 MB/s** |
| M7 binary, `ssr: true` | 0.0281 ms | 0.0093 ms/compile, 126.5 MB/s |

The middle row is **the one carried-forward number in this section**, in italics: M5, M6 and M7 all
landed in commit `c70d508`, so there is no intermediate binary to rebuild and the pre-G6 figure
cannot be reproduced from git. It is the G6 investigation's own measurement, taken by reverting its
five edits in the working tree and rebuilding, on the same methodology as the rows around it.

Read as a trend: M5–M6 cost **+6.3% on a file and +9.6% on the corpus** against M1–M4 (the +5.7% /
+9% the gap list recorded, re-derived). M7's G6 work recovered that and more — the current binary is
**7.7% faster than M1–M4 on a file and 7.8% faster on the corpus**, i.e. **11–15% faster than the
M6 binary**, and corpus throughput went 111.2 → 120.6 MB/s.

That comparison understates the current compiler, because **the two binaries are not doing the same
amount of work**. On the same 110 fixtures the M1–M4 binary emits 186 templates and 91
`createElement` fallbacks; the current one emits 192 templates and only 13 `createElement` — it
compiles the component, control-flow and table shapes M1–M4 punted on, and is still faster.

SSR is cheaper than DOM because P8b skips P5-anchor, P6 and P7. Everything is 30x under the 1 ms
budget. Historical self-reported figures for context, in their own units: M1 0.0108 ms typical;
M5 0.0261 ms slowest.

Where the M5–M6 regression actually was, since the gap list guessed wrong: not the new passes (the
whole pass stage profiles at 2.6–7% of a compile) but `codegen::Emit::new`'s hygiene preamble, which
did a `format!` plus a whole-source substring search *per helper* — and `HELPER_COUNT` went 7 → 22
when the string backend's helpers landed, so a fixed per-compile cost tripled. Details in §6.

### Against the Babel plugin

The Babel plugin is deleted from `HEAD` (M6 scheduled it), so this comparison is no longer a
`git archive HEAD` away — it is reconstructed. `packages/compiler/src/babel.ts` and its six
transforms were restored from `git archive 317589b` into a scratch directory *outside the repo*
with its own `@babel/core` 7.29.7 + `@babel/preset-typescript`; `bun.lock` was not touched. Both
compilers produce 9 templates for the typical file, so both really did the work:

```
typical component file: 3335 bytes, 113 lines
babel  output: 4491 bytes, 9 templates
native output: 4361 bytes, 9 templates

babel plugin (@317589b, +TS preset)   1.2333 ms/compile
native compiler-rs                    0.0306 ms/compile
native is 40x faster on the same file

corpus: 110 fixtures, 128855 bytes; babel failed on 0
babel  0.4228 ms/compile    2.77 MB/s
native 0.0099 ms/compile  118.45 MB/s
native is 43x faster corpus-wide
```

The Babel plugin is **over the 1 ms budget** for one typical file — 1.23 ms here, where the M6
report measured 0.95 ms for the same plugin on `@babel/core` 7.28.x. Treat the absolute Babel figure
as version-dependent and the ratio as the claim: 40x on a file, 43x corpus-wide. The native compiler
is at 3% of budget.

---

## 5. What is left

This is the section to read before touching anything.

### 5.1 Open gaps, in priority order

Nothing here is a blocker. Everything here is something the next person will otherwise rediscover.
The M7 gap letters (G1–G6) are the *closed* ledger and live in §6; the numbering below is this
section's own and does not collide with them.

**1 — SSR emitted code has NO snapshot coverage.** All 220 snapshots are DOM: 110 in
`roundtrip.test.ts.snap` (the emitted module, one per fixture) and 110 in `oracle.test.ts.snap`
(marker channels). The `ssr: true` backend is exercised only by live rendering in `ssr.test.ts`.
That is why M7's `attr` → `attrLit` change moved 58 SSR emissions while "no pre-existing snapshot
changed" was simultaneously true — the two statements do not contradict each other, they measure
different halves. The substitute checks are strong (`attrLit(name, v) === attr(name, v, tag)` over
672 comparisons, plus the compiler-vs-runtime gate agreement test), but a byte-level regression in
the *shape* of an SSR emit that leaves rendered bytes unchanged is currently invisible.
**Fix: add a second snapshot file over `compileFixtureSsr(name)`.** Cheap, and it makes every future
SSR codegen change reviewable as a diff.

**2 — `Op::SetClass`, `Op::SetStyle` and `Op::Spread` are constructed by no pass.** Verified again
here: `grep` over `src/passes/` and `src/lower/` finds no constructor. `class`, `style`, `ref`,
`innerHTML` and spreads all arrive as `SetOnce`/`SetLive`/`SetOpaque`. The three opcodes exist with
live rows in both backends' dispatch, which is genuinely total in both directions
(`attribute_slot` → `Slot::{Named,Unnamed,Elsewhere}` with no wildcard, `attribute_call`
`unreachable!`s on the rest), so adding a constructor forces a decision in both places or the crate
does not compile. But they are latent code and a reader should know it. Documented in DESIGN §4's
M6 second-pass amendment.

**3 — Hydration is replace-based.** `dom.ts` `hydrate()` calls `render()` and replays captured
clicks; it does not reuse server-rendered nodes. This is DESIGN O8 and it was explicitly out of
scope — the structural reason is in §5.2.

**4 — `styleToString` and `classToString` are the remaining SSR hot spots, and they are not ours to
move.** After G1 the escapers are no longer the top cost of an attribute write. Measured here on a
harness whose own baseline is 24 ns (string cases) / 5 ns (object cases), gross ns per call:
`spreadAttrs(4 keys)` 126, `attr("style", object)` 86, `esc(escapable string)` 78, `attr("data-id",
string)` 68, `cls(3 parts)` 64, `attrLit("data-id", string)` 62. `attr("style", object)` is now the
single most expensive attribute write in the surface, and the work is in `styleToString` —
which lives in `packages/core/src/dom.ts`, shared with the client path and read at build time by
`build.rs` as the source of truth for the compiler's own `fold_style`. `toKebabCase` is already
cached and `CSS_NUMBER_PROPS` already uses the fast `in` lookup; the G1 pass found no cheap win and
deliberately did not edit it. Anyone who does must keep the compile-time fold and the runtime in
lockstep, or the drift test in `ssr.test.ts` goes red — which is the point.

**5 — the `escapeText` probe gate is a constant tuned on one engine.** The text escaper asks
`indexOf` before scanning only above 32 characters (four escapable characters means four `indexOf`
passes, so on short strings scanning outright is cheaper); the attribute escaper, with two, never
asks. The crossover was measured at ~32–40 chars on Bun/JSC. It has not been re-measured on V8, and
a wrong constant costs performance, never correctness. `packages/core/src/ssr.test.ts`'s boundary
corpus straddles the gate at 13 lengths, so the *behaviour* is pinned in both branches whatever the
constant is.

**6 — `attr()` throws on an invalid attribute name.** Deliberate parity with `setAttribute`'s
`InvalidCharacterError`, added to close an injection where `{...untrusted}` wrote attacker-controlled
object keys as attribute names. It is a behaviour change for anyone who was spreading untrusted keys
and previously got silent (unsafe) output. Where happy-dom is *laxer* than a real browser (it accepts
a space and a non-breaking space in a name), SSR is deliberately the stricter side, and the test
asserts only the safe direction — `oracle threw ⟹ ssr threw`, never the reverse.

M7 added a memo in front of that check, which introduces its own invariant: **the name cache only
ever caches an acceptance, is bounded at 1024 entries, and an invalid name always re-runs the regex
and throws.** A test pins it by filling the cache with 2000 names and then asserting `bad name` still
throws. Do not "simplify" the cache into one that also remembers rejections — that is the shape that
could launder a name.

**7 — `attrLit` is a second transcription of `attr`'s dispatch rules, on purpose.** The compiler
emits `attrLit(name, value)` instead of `attr(name, value, tag)` when a literal name is outside
`ATTR_INTERCEPTED`, is not `on…`-prefixed, and satisfies the XML `Name` production — which skips
`checkName`, two aliases, three table lookups and the element-dependent `value` rule at runtime, and
is worth ~1.5x on an attribute write and ~19% on the 100-row page. **`spreadAttrs` still calls
`attr`**, so the M6 fix on attacker-controlled names is untouched, and a test asserts a spread never
takes `attrLit`. Drift is a build error rather than a convention: `build.rs`/`dom_ts.rs` read
`ATTR_INTERCEPTED` out of `ssr.ts` the way they already read `dom.ts`'s tables, with
`cargo:rerun-if-changed` on both. Two cross-check tests compare the compiler's per-name choice
against the runtime's own answer, and `attrLit(name, v) === attr(name, v, tag)` over 6 tags × 14
values for every name the compiler routes there. It is still a duplicated rule set and it still
deserves the paranoia.

**8 — the DOM head-to-head hand-writes both frameworks' emitted shapes, and has two known biases.**
`bun run bench:shape` audits this by compiling the equivalent JSX through both real compilers and
diffing the helper sets. Both remaining biases are **against barq**, so no result is flattered:
Solid minifies its template strings and the benchmark feeds both the fully-closed one, charging
Solid a parse it would not pay; and the benchmark writes `barq.insert(span, () => s())` where both
compilers emit the bare accessor `s`, charging barq one extra closure call per read on every insert
case. `prop: class update` looks like drift and is not — `class` is a `STATEFUL_DIFF` channel the
compiler deliberately leaves out of the compiled effect, so `class={() => …}` really is the live
form; the liveness table in `bench:shape` proves it and throws if any row moves.

That table also records a genuine footgun, intended and not ours to change this milestone:
`id={s()}` auto-thunks and `class={s() > 3 ? "a" : "b"}` does not, silently
(`passes/classify.rs:118` keeps the five `STATEFUL_DIFF` props out of the compiled effect so the
runtime can keep threading and removing).

**9 — `dom-head-to-head.ts` reports min-of-7 inside one process.** Three of its seven cases straddle
1.0 and change sign between runs. The file now prints a footer naming them and pointing at
`bench:spread` and `bench:replace-all`. A stronger fix is to make the file itself paired and
multi-process; it was left as-is so its protocol stays the one the historical numbers were taken on.
Related: the M7 report's phrase "never slower in 7 paired processes" is true of
`dom-replace-all.ts` on the machine that ran it and is **not** a property of the case —
`protocol-spread.ts` has put the same case just above 1.0. The defensible statement is the CONTROL
plus the distribution, which §3 now gives.

**10 — `@babel/core` is a direct devDependency of `packages/benchmark`.** M6's report noted every
`@babel/*` entry in `bun.lock` was transitive; that is no longer true, because the SSR head-to-head
now drives `babel-preset-solid` rather than hand-transcribing Solid's output. The trade is
deliberate — hand-writing a competitor's compiler output is exactly the drift M7 removed — but it is
a real change to the dependency story, and installing it re-resolved the workspace's transitive
`@babel/*` from 7.28.x to 7.29.x. Nothing shipped depends on it. Reverting means reintroducing the
drift; the alternative worth considering is vendoring Solid's emitted module as a checked-in fixture
with a test that regenerates and compares it.

**11 — one live `it.todo`.** `dedup-identical-markup: zero patch calls across both components` in
`optimality.test.ts`. It is a stronger claim than target #6 currently delivers — the fixture
legitimately emits two `insert` calls for its two component children — and reaching it needs
component inlining, which no milestone scoped. Left as a stated aspiration rather than deleted.

**12 — `test.md` is gone.** An untracked file listed in the M6 session's opening `git status`
snapshot is absent from the working tree and `git stash list` is empty, so it is unrecoverable from
git. It was already missing before that session's first tool call. Still worth asking whether it
mattered.

### 5.1.1 Optimizations that were measured and REJECTED

Recorded so nobody re-derives them. Each was a plausible win that did not survive measurement.

**Fragment → array literal (~176 ns/fragment): not semantics-preserving.**
`createElement(Fragment, null, () => "hello", <b/>)` renders `<b></b>`; the array literal
`[() => "hello", <b/>]` renders `hello<b></b>` — `Fragment` silently **drops a function child**.
The differential oracle uses the same `Fragment`, so the emit change would make the compiled path
disagree with the uncompiled one and the harness would go red, correctly. Fixing it properly means
changing `Fragment` in the runtime, on both paths. A legitimate follow-up; not a drop-in.

**Static prop specialisation (`_$setProp` → `el.setAttribute` for a compile-time-known static
prop): measured at 1.0000x.** A hunt put it at 12–16 ns/write in isolation but "~1% at page scale
and inside run-to-run noise", sign-changing across two runs. Re-measured on the real emitted module
(1000-row build, one static `data-id` per row, 50 paired trials in real Chrome): **ratio 1.0000x,
0.0 ns/write saved.** Medium risk — the namespace decision, the `className`/`htmlFor` rewrites, SVG
kebab-casing and `DOM_PROPS` routing all have to be re-derived in the compiler — for a page-level
win indistinguishable from zero. The bundle-size argument for it remains true and is a separate
change with a separate justification.

*M7c note, because this row and `CODESIGN.md` §0.4 (C6) look like they disagree and do not.* The
Tier-2 channel bench prices the dispatcher at **+36%** on `setProp(el,'id',v)` against a like-for-like
`setAttribute` — 294 vs 216 ns a write over 20,000 writes in a tight loop. This row prices the same
removal at **0.0 ns a write** on a real 1,000-row page. Both are correct: a page does ONE static
write per row against a row that costs ~1,900 ns to mount, so a 78 ns dispatcher is 4% of one write
and 0.04% of the frame. The tight loop measures the dispatcher; the page measures what the dispatcher
is worth. **Quote the second when deciding whether to build something, and the first only when
explaining why the second is small.**

**`<math>` at a template root: unmeasured.** A hypothesis with a confirmed mechanism and no data,
and no MathML in any real code in this repo. Listed so the next person knows it was considered.

**`NOT_AN_ATTRIBUTE` / `DIRTY_VALUE` as a `Set`: a 3.6x regression.** JSC's inline cache makes
`key in obj` cost 1.19 ns against `Set.has`'s 4.30 ns. The "obvious" modernisation is wrong here.

### 5.2 Deliberate divergences

**O3 — `{item.name}` on a keyed `For` row diverges from Solid.** Under the lifting rule a member
read on a keyed row item performs no tracked read, so it is applied once with no thunk and no
effect. That matches the uncompiled oracle and is a large win on list-heavy pages, but Solid keeps
it reactive, and it produces a silently non-updating cell when the row item is a store proxy the
analysis missed. It is **on by default, with a dev-mode note** when `each`'s origin cannot be
proved (`passes/shape.rs:280`):

> `For: the origin of` each `cannot be proved to be values` mapArray `recreates, so a member read on
> the row item is applied once with no effect (DESIGN O3). If these rows are store proxies, read them
> through an accessor instead.`

The gate is deliberately *not* "the compiler knows nothing" — gating on `Opaque` stayed silent for
the demonstrable failure case (`each={store.items}`), which is exactly the one that needs the note.

**O7 — `Dynamic` flattens getters, and warns.** `components.ts` does
`const { component: _, ...rest } = props`, which reads every getter once and hands the rendered
component dead values. The compiler emits a real warning rather than special-casing it
(`passes/shape.rs:288`):

> `Dynamic spreads its props, which reads every getter once and loses fine-grained flow into the
> rendered component (DESIGN O7). Pass an accessor instead.`

Both O3's note and O7's warning are **dev-only**. `packages/compiler/src/vite.ts` derives `dev` from
Vite's own mode, and three tests bracket the hook (serve warns with O7, production does not, an
explicit `dev` wins in both directions) so deleting it turns all three red.

**O8 — hydration is out of scope, and the reason is structural.** Claim-based node-reuse hydration
would need the SSR backend to emit the DOM backend's markers *plus* a hydration key per unit —
a third serialisation mode that directly contradicts §5's "drop the markers to keep the payload
small". The IR already carries what it would need (`Skeleton::origin`, per-`Unit` spans,
`SkelNode::Marker`), so this is a design decision, not a missing capability.

**`ref-binding` — the one declared SSR markup divergence.** DESIGN §5 drops the `Ref` opcode on the
SSR target; a ref resolves to a node and there are no nodes on the wire. The fixture's callback ref
mutates the element it is handed, so the DOM render carries a `data-reffed` the string render
structurally cannot. It carries an `ssrDiffers` declaration with an enforced staleness check that
fails if the two paths ever agree.

**`SsrHtml` is a branded object, not the bare string DESIGN §5 wrote.** This is the one deliberate
deviation from §5's literal `renderToString(fn: () => string)`, and it is what closes composition in
both directions: a string module can render a fallback module's real `Node`, and a fallback module
can render a string module's markup instead of escaping it. The brand is `Symbol.for("barq.ssr.html")`
— registered, so it is unreachable from `JSON.parse` but still identical across the two copies of
`dom.ts` that the `.` and `./server` entries really are. A `WeakSet` would not have survived that.

**Raw text: the oracle is not the specification.** `renderToString` serialises a `<script>` text node
verbatim, so its own bytes reparse into a breakout, and happy-dom escapes `<iframe>`/`<noscript>`
where a real browser does not. The raw-text cells therefore assert the *property* (nothing escaped
the element) rather than equality with the oracle. Written up in DESIGN §5's M6 amendment.

**Compiler-mode auto-thunking (O4).** `<div>{count()}</div>` is a one-shot text node under
`createElement` and the compiler makes it live. This is the documented `IsCompilerMode` /
`StrictAccessor` contract in `config.ts`, so the invariant "never do more reactive work than the
oracle" is deliberately false for exactly the `Reactive` class, and the differential harness
special-cases it rather than diffing effect counts blindly.

**Implicit accessor calls are gone.** The deleted Babel plugin rewrote `const doubled = count * 2`
into `() => count() * 2` and `setCount(count + 1)` into `setCount(count() + 1)`. This pipeline
structurally cannot host that — `lower::lower` takes no `Program` and `codegen::emit` only splices
at the sites harvest recorded — and doing it would require guessing whether `count` is a signal,
which is the name heuristic the project exists to replace. **Nothing warns**, and `count * 2` over a
signal is `NaN` at runtime. The migration note is in `packages/compiler-rs/README.md`.

### 5.3 Verifier findings that were rejected rather than fixed

Three, all from the M6 review pass:

1. **"`@barqjs/core/server` pulls in `dom.ts`, so a server bundle loads the DOM runtime."**
   Rejected. `ssr.ts` imports `classToString`, `styleToString` and `isSsrHtml` from `dom.ts`
   deliberately, as the single source of truth that keeps the two backends from drifting. The cost
   was measured and is zero: a compiled SSR module run under plain `bun run` with
   `typeof document === "undefined"` produced correct markup and exited 0 (reproduced again while
   writing this report — see §1). The *other* half of that finding, dead flow-import specifiers, was
   fixed: `install.rs::drop_rewritten_flow_imports` drops a specifier only when the rewrite count
   equals the binding's resolved references minus JSX closing tags.

2. **"DESIGN's `packages/compiler 55 pass` figure describes a tree that no longer exists."**
   Rejected as not-in-tree. `grep -rn "55 pass"` over the repo (excluding `node_modules`, `target`,
   `dist`) returns nothing; the figure was in an agent's report text, never in a file.

3. **`test.md`.** Report only — see §5.1 item 12.

The M7 review pass added a fourth, which is a *limitation* rather than a rejection:

4. **"G6's 'not one byte of output moved' cannot be independently reproduced."** True at the time:
   M5, M6 and M7 were all uncommitted in a single working tree, so no intermediate binary existed to
   diff against. The claim was instead verified adversarially (144 compiles over sources
   pre-declaring `_$template`/`_$$template`/`_$$$template`, every helper name at three sigil levels
   and every uid base; sigil and uid escalation both fire and the user's binding survives verbatim).
   The tree is committed now, so the *next* such claim is checkable — which is the reason to keep
   milestones in separate commits.

### 5.4 Paid debts, for the record

Every one was verified by building the mutation the claim implies and watching it go red, not by
reading the code. The four M6 security blockers (`spreadAttrs` writing attacker-controlled attribute
names, the forgeable `SsrHtml` brand — which had opened a *client-side* XSS in the default DOM path,
`rawText` not neutralising close-tag sequences, and the compiler's `bake_text`/`bake_attribute`
escapers having zero coverage) are all closed and mutation-checked; all four were re-run verbatim
while writing this report and the output is in §1. The CSS_NUMBER_PROPS drift check was not deleted
but made true: editing `dom.ts`'s table *without rebuilding the binary* — the exact stale-artifact
scenario — now turns the row red. The SSR fallback contract, which used to leave all 1078 assertions
green when `uninlinable_flow` always returned `None`, is now pinned as an exact partition plus a
per-fixture diagnostic assertion. Debt 12's destructive fragment drain (a multi-node eager body
rendered once, then empty forever) is fixed in `dom.ts::drainFragment` with three tests including
node identity across a reactive cycle.

M7's review pass found three more and all three were fixed in `962724b`:

- **`class={() => ""}` diverged between the two backends.** `classToString` answers `null` for
  nullish and `false` (the DOM path calls `removeAttribute`) and `""` for an empty string, array or
  object, which it assigns to `className`, leaving `class=""` on the element. The string backend
  omitted the attribute for both. `classList` was the other half: `diffClassList` toggles the keys of
  an *object* and does nothing with a string or an array, where `clsList` happily turned one into
  tokens — so `classList={"a b"}` wrote a class on the server the client never writes.
  `fixtures/class-empty-string.tsx` carries all four shapes through the dual render.
- **O9's string half had no test.** `sameTree` canonicalises the leading newline run on both sides,
  so an SSR backend that stopped doubling — or dropped the newline entirely — still compared equal to
  the oracle. `ssr.test.ts` now runs the `pre-leading-newline` fixture's own `emits`/`absent` needles
  against the `ssr: true` emit; both mutations go red.
- **The escaping matrix could not see two of its own rules.** Dropping the U+00A0 text escape, and
  cutting a slice boundary between the halves of a surrogate pair, both left all 144 cells green,
  because every cell is a *parse*. A byte-level row now asserts the rendered bytes for U+00A0 and an
  astral pair, in text and in an attribute, on both escapers.

---

## 6. Milestone 7 — what changed and what it measured

M7 was a performance and conformance pass, not a feature one. Two changes move the emit and both are
deliberate: `attr` → `attrLit` on 58 SSR emissions, asserted to produce identical rendered bytes; and
the table-root relaxation, which changes the emit only for table markup that no pre-existing fixture
contained. Everything else was verified byte-for-byte unmoved. Six gaps were named with a number
attached; five closed, one was settled as a measurement artefact.

### G5 — the escaping matrix's dynamic half was not dynamic — CLOSED, and done first

90 of the matrix's cells were constant-folded by P3 on **both** backends, so they were byte-identical
duplicates of the static half and never reached the runtime escaper — the exact code G1 was about to
rewrite. Verified empirically rather than by reading: the escapers were instrumented with a counter
and every cell compiled both ways. Under the old `const VALUE = "…"` spelling, **16 of 144** cells
entered `escapeText`/`escapeAttribute` and 128 were duplicates of the folded half; routing the value
through a call P3 cannot fold takes it to **144 of 144, with 0 duplicates**. A guard test asserts the
dynamic half really is dynamic and goes red under an identity compiler. `ESCAPE_VALUES` also gained a
120-character clean run that only turns hostile in its last two bytes, because every other value
escapes in its first few characters and nothing exercised the new probe's late-hit path.

Doing this first was the point: rewriting a hot path whose tests do not execute it is how a security
fix gets silently reverted.

### G1 — `esc()` was the entire SSR gap — CLOSED

`escapeText`/`escapeAttribute` were `value.replace(/[&<> ]/g, callback)`. They are now an
`indexOf` probe followed by a slice-and-append `charCodeAt` scan. Re-measured for this report by
reconstructing the old regex escaper alongside the shipping one and asserting byte equality per case
*before* timing — best of 11 trials × 200k iterations over a 64-lane varying input:

| case | before ns | after ns | |
|---|---:|---:|---:|
| `escapeText` `"item N <&>"` | 122.7 | **20.6** | 5.96x |
| `escapeText` clean short | 18.9 | **9.0** | 2.09x |
| `escapeText` clean ~32 (at the probe gate) | 27.2 | 23.1 | 1.18x |
| `escapeText` clean ~120 | 100.1 | **27.5** | 3.64x |
| `escapeText` clean ~595 | 503.2 | **29.9** | 16.81x |
| `escapeText` dirty 200 | 1845.1 | **426.4** | 4.33x |
| `escapeText` U+00A0 | 105.9 | **31.4** | 3.37x |
| `escapeText` astral pair | 19.1 | **9.0** | 2.11x |
| `escapeAttribute` `"row N"` | 17.9 | **8.7** | 2.06x |
| `escapeAttribute` `"` + `&` | 97.8 | **26.9** | 3.64x |
| `escapeAttribute` clean ~120 | 18.7 | 13.1 | 1.43x |
| `escapeAttribute` clean ~595 | 25.6 | 17.0 | 1.50x |
| `escapeAttribute` dirty 200 | 1498.2 | **411.8** | 3.64x |

And on the page, reproducing the exact shape the compiler emits for the head-to-head fixture, with
the two pages asserted byte-identical before timing:

```
100-row page, escaper calls only : 14.64 -> 2.20 us   6.67x
100-row page, full assembly      : 14.66 -> 3.09 us   4.74x
escaper share of the page: before 100%, after 71%
```

14.64 µs reproduces the gap list's "14.7 of the 15.2 µs a 100-row page cost is that one function"
almost exactly. **The escaper was the whole SSR deficit and it is gone.**

Two findings that changed the shape from a naive transliteration of Solid's escaper, both worth
keeping: the text probe is length-gated at 32 and the attribute probe is not (four escapable
characters means four `indexOf` passes, so scanning outright wins on short strings — see §5.1 item
5); and benchmark methodology mattered more than the code, because passing a candidate as a
*parameter* makes the callsite polymorphic and moves `String.replace` off its inlined path, which
inflated one early baseline by 10x.

Semantics did not change, and the evidence for that is **not** the matrix — the matrix compares
parsed trees and cannot see a change of spelling (§2 #10 says so). Byte identity was established by
fuzzing the new escapers against a reference `String.replace` implementation: 412,780 strings in one
pass and 409,158 comparisons in another, over random alphabets including `&<>"`, U+00A0, astral
pairs, **lone** surrogates, U+2028/2029/FEFF/200B, plus exhaustive one-escapable-character-at-every-
index for every length 0–70 straddling the probe gate. Zero divergences, zero surrogate breaks.
`packages/core/src/ssr.test.ts` gained a 638-string boundary corpus asserting the same property
against `renderToString`, taking that file from 4038 to 6041 `expect()` calls.

### G2 — the SSR benchmark measured the wrong path — CLOSED

Rewritten to drive both real compilers over one shared source and time the emitted modules. Full
numbers and the emitted shapes are in §3. The old "solid is 18.2x faster" headline described the
uncompiled path; the compiled path now reads barq 1.91x *faster*.

### G3 — "replace all 100 rows is 1–3% slower" — SETTLED: NOT REAL

Two independent harnesses, one with an unbiased CONTROL. The distribution and the verdict are in §3.
The original claim came from reporting min-of-7 inside one process on a case whose per-trial CV is
~12%, where allocation and GC dominate. No change was proposed or applied to `packages/core`.

### G4 — the SSR `<pre>` newline divergence — CLOSED

The parser ignores one U+000A after `<pre>`/`<textarea>`/`<listing>`, so the only spelling producing
a text node that starts with a newline is a doubled newline, which both backends emit. Chrome's
*serialiser* does not put it back — it writes `<pre>\na</pre>` for a node whose text is `\na` — so a
byte comparison between an SSR string and a serialised DOM legitimately differs by one newline, while
a tree comparison in a real browser does not differ at all. happy-dom implements neither half, which
is why no fixture could carry the shape: it went red there for a reason a browser does not have.

The comparison now models each half where it is actually lossy. `normalize.ts` (tree against tree)
**detects** whether the host parser implements the rule and canonicalises the leading newline run
only where it does not — real Chrome is compared exactly, so a compiler that stopped doubling is
still a divergence there. `test/ssr.ts::sameTree` (markup string against a serialised DOM)
canonicalises unconditionally, because that loss is the serialiser's and every engine has it. The
same canonicalisation covers a `<textarea>`'s `value`/`defaultValue`, which come from its parsed
content and carried the divergence in a second channel. `browser.test.ts` admits exactly this one
parser disagreement **and asserts it is still reached**, so the exemption cannot go blind, and
`fixtures/pre-leading-newline.tsx` carries the shape. Verified load-bearing by forcing the detection
to "conforming" under happy-dom, which puts the fixture straight back in the red.

Both canonicalisations are lossy by design, so neither half of O9 can be pinned by the dual render
alone. The DOM half is pinned by `compile.rs`'s two O9 tests over the emitted template; the string
half by `ssr.test.ts`'s "O9: the SSR chunks double a leading newline, byte for byte", which runs the
FIXTURE's own `emits`/`absent` needles against the `ssr: true` emit — added in the M7 review, because
without it `sameTree` compared equal to an SSR backend that dropped the newline outright.

### G6 — compile throughput regressed across M5–M6 — CLOSED, and exceeded

Profiling put the whole pass stage at 2.6–7% of a compile, so none of the named suspects (P5-anchor,
group, P8b, the namespace-flow bind walk, the style fold, import pruning) was the regression. It was
one line in `codegen::Emit::new`, which did a `format!` plus a whole-source substring search **per
helper** — and `HELPER_COUNT` went 7 → 22 when the string backend's helpers landed, tripling a fixed
per-compile cost. That is also why the small-file corpus regressed harder than the typical file.

| what | as found | rewritten |
|---|---|---|
| helper sigil + 22 names (`codegen/mod.rs`) | 2137 ns | 495 ns |
| 6 uid `free_name` scans (`ir/module.rs`) | 348 ns | 177 ns |
| `nesting_estimate` (`compile.rs`) | 1043 ns | 599 ns |

Plus: `lower/text.rs::clean` returns `None` for a whitespace-only run before allocating, and
`codegen/install.rs` no longer copies a `&'static str` into the arena. The trend table is in §4 —
the current binary is 7.7% faster than M1–M4 on a file while emitting 192 templates against its 186
and only 13 `createElement` against its 91. Output was verified unmoved over 848 fixture compiles
plus 1120 adversarial ones targeting the rewritten hygiene allocators; two tests were added
(`free_sigil`'s escalation had no coverage at all, and the exact whitespace set behind `clean`'s new
shortcut, where `is_ascii_whitespace` would have been wrong).

The profile is now flat — no barq function above 3.4% self time, the top entries being oxc's parser
and semantic builder. One further win was **declined**: a hand-unrolled 4-way accumulator in
`nesting_estimate` measured 403 ns against the 599 ns shipped, another 0.8% of a compile, at the cost
of a visible manual unroll in stack-overflow-guard code.

### Changes M7 made that were not on the gap list

- **Table-scoped tags at a template root.** `lower/parse.rs::reshapes` refused `tr`/`td`/`th`/
  `tbody`/`thead`/`tfoot`/`caption`/`colgroup`/`col` at a template root because it modelled "in
  body". A template root is parsed by `<template>.innerHTML`, i.e. **"in template" insertion mode**,
  which pushes "in table"/"in table body"/"in row"/"in column group" for exactly those start tags.
  The relaxation is gated on `at.parent.is_none()`. `<table><tr>` (implied `tbody`) stays refused;
  `fosters_text` and `NEVER` stay. Measured on the real emitted modules in real Chrome
  (1000-row `<For>` build, 42 interleaved samples): **4.600 → 3.400 ms median, 1.35x**. The corpus
  had no table markup at all before this (`grep '<tr\|<td\|<table' fixtures/` was empty);
  `fixtures/table-rows.tsx` (the js-framework-benchmark row: 2 templates, 0 `createElement`, 0
  markers) and `fixtures/table-root-shapes.tsx` now cover it.
- **`attrLit` for a compile-time attribute name.** See §5.1 item 7 for the contract and its guards.
  Isolated: 2.53x. On the shipping benchmark the envelope went 5.62 → 4.55 µs.
- **`insert()` static-primitive `textContent` fast path** in `dom.ts`, guarded on `text !== ""`
  because `textContent = ""` creates no node where `appendChild` creates an empty one. Real Chrome,
  20,000 holes, A/B order flipped, 50 paired trials: **200.0 → 150.0 ns/hole, 1.333x.** It is a live
  path, not a synthetic one — across a full corpus render it takes the fast branch 26 times to 5.
- **Benchmark harness repairs.** `dom-head-to-head.ts` did not run at all as documented (its header
  omitted `--conditions=browser`, so `solid-js/web` resolved to its server build and `template()`
  threw); its reactivity guard covered only the text hole, so a `class` write that silently never
  landed would have handed barq a free 1.27x. Both fixed, plus `bench:dom`/`bench:ssr`/
  `bench:replace-all`/`bench:shape`/`bench:spread` scripts and a `solid.isServer` guard with the
  remedy in its message.

### How M7 verified it changed no output

- **848 compiles** (every fixture × {dom,ssr} × {map,no-map} × {dev,prod}), code + sourcemap +
  warnings, dumped from the pre-change binary and the final one: `diff` clean.
- **1120 adversarial compiles** targeting the rewritten hygiene allocators: `diff` clean, and
  confirmed non-vacuous (4 levels of sigil escalation, 3 of uid escalation observed).
- **436 compiles** after the deliberate changes: the DOM emit moved for exactly the two new table
  fixtures and nothing else; the SSR emit moved for exactly the 58 `attr` → `attrLit` swaps.
- **A mutation sweep** over the escapers and the security fixes: 8 mutations, all caught. Skipping
  `&` → 6 core + 10 compiler-rs failures; skipping `<` → 9 + 28; escaping twice → 5 + 47; `attr`
  accepting an invalid name → 2 + 2; a plain-string brand → 2 + 2; `spreadAttrs` taking `attrLit` →
  3 + 1. Two mutations were caught **only** by `packages/core` (skipping U+00A0, splitting a
  surrogate pair) — that is what the M7 review's third fix addressed by adding a byte-level row to
  the matrix.
- **A vacuity check**: a stub `index.js` returning its input unchanged produces 934 pass / 324 fail
  and 121 red snapshots. The 144 matrix cells and the 110 dual-render rows do pass vacuously — that
  is inherent to a differential harness whose oracle *is* the identity output — but every group
  carries at least one guard that goes red, and those guards are named in the suite.

---

## 7. Runtime changes to `packages/core`, across all seven milestones

Every change below exists because a compiler target or a real bug required it. Nothing was added
speculatively.

### Committed with milestones 1–4 (`7f81edd`)

| change | justification |
|---|---|
| `delegateEvents` / `clearDelegatedEvents` made public (`dom.ts`, `index.ts`) | **Target #7.** DESIGN O1: without an exported registrar every compiler-emitted `$$click` write is a silently dead handler, and target #7 is off the table. `clearDelegatedEvents` is what the differential harness calls between renders. |
| SVG `class` writes go through `setAttribute` (`dom.ts`) | **DESIGN O5, a real bug.** `applyResolvedProp` wrote `element.className = …`, but on an `SVGElement` `className` is a read-only `SVGAnimatedString`, so the write silently failed. Confirmed in real Chrome by `test:browser:svg`, which asserts the property *has no setter* before asserting the fix. |
| `delegate-events.test.ts` (273 lines), `dom-classlist.test.ts` (112), `dom-svg.test.ts` (265) | coverage for the two above |

### Committed just before M1 (`1f8c895`) — the change target #9 depends on

| change | justification |
|---|---|
| `insert()` tracks its own nodes in an array instead of fencing content between two comments | **Target #9.** A lone text hole cost three DOM nodes where Solid costs one. `insert()` now tracks `current` the way `insertExpression` does, and a hole with no following sibling writes straight through `parent.textContent`. Nodes per text hole 3 → 1. This is what lets the compiler emit a 2-argument `insert` and bake no marker. |

### Committed with milestones 5–7 (`c70d508`, then `962724b`)

| change | justification |
|---|---|
| `src/ssr.ts` (new, 464 lines) — `esc`, `escAttr`, `attr`, `content`, `cls`, `clsList`, `raw`, `rawText`, `spreadAttrs`, `html`, `SsrHtml`, and `ssrFor`/`ssrIndex`/`ssrRepeat`/`ssrShow`/`ssrSwitch`/`ssrMatch` | **Target #10.** The string backend has to call into something. Each flow helper reproduces `components.ts` line for line and is compared against the real component's markup in `ssr.test.ts`. |
| `src/server-entry.ts` (new) + `"./server"` export condition + tsdown entry | **Target #10.** The export condition DESIGN §5 requires; `renderToString` and the escapers behind one entry. |
| `dom.ts`: export `classToString`, add `styleToString` | Single source of truth for the class serialisation and the kebab+px rule, so the DOM and string backends cannot drift. `styleToString`'s rule is what the compiler's `fold_style` reproduces at compile time (target #3). |
| `dom.ts`: `SSR_HTML_BRAND = Symbol.for("barq.ssr.html")`, `isSsrHtml`, `ssrHtmlNodes`, wired into `appendChild`, `normalizeChildToNodes` and `insert`; `components.ts::childToNodes` | **Target #10's fallback contract.** A module that fell back to the DOM backend must be able to render a string-compiled component, or the 6/8 split is unusable. The registered symbol is the security half: this brand decides markup-vs-escaped-text, so a JSON-producible shape would make every deserialised object an injection point. |
| `dom.ts`: `drainFragment` + `drainedFragments` WeakMap, replacing three duplicate drains | **A real bug, debt 12.** Reading a fragment's children is destructive. `insert(host, () => on() ? frag : null)` rendered, then went empty, then stayed empty forever. Target #8 hands the runtime eager multi-node bodies as a matter of course, so this is the ordinary path. |
| `components.ts::Switch`: `children` may be a bare `Child`, not only a function | **Target #8.** A compiled static `Match` body arrives as a node, not a thunk. `Show` already read its children this way. |
| `server.ts`: `renderToString` / `renderPage` accept `SsrHtml`, and no longer require a DOM when the value is one | **Target #10.** One entry point for both strategies. `renderPage` re-renders once after `settle` because the string backend has no `Loading` boundary to swap in place; keyed `createAsync` results are session-cached so nothing is fetched twice. |
| `index.ts`: export `classToString`, `styleToString`, `isSsrHtml` | The brand predicate is read on the client, and the conformance harness needs the two serialisers to compare against. |
| `jsx-runtime.ts`: declare `dangerouslySetInnerHTML?: { __html: string }` | **Fixing a typecheck-baseline row at its source** rather than adding one. The gate's "the list only shrinks" invariant now holds without an exception; 43 → 41. |
| `attr()` validates the attribute name against the XML `Name` production and throws | **Security.** `{...untrusted}` wrote attacker-controlled object keys as attribute names, where the DOM path throws `InvalidCharacterError` — SSR was the unsafe side of a real divergence. See §5.1 item 6. |
| `rawText(value, tag?)` neutralises `</` + owning tag, and `<!--` in script data only | **Security.** A dynamic value inside `<script>`/`<style>`/`<iframe>`/`<noscript>`/`<noembed>`/`<noframes>`/`<xmp>` escaped its element and became a live `<img onerror>`; verified in real Chrome over CDP. `</` before a non-letter never opens an end tag, and `\/` is an identity escape in both a JS string and a CSS string, so a payload survives verbatim where it matters. |
| `ssr.test.ts` (new, 523 lines) | coverage for all of the above, every hostile cell asserted against `renderToString` of the same value through `createElement` |
| `classAttr` writes ` class=""` for an empty-but-present class; `clsList` answers `null` when it contributes no token, and only for an OBJECT; `cls` tracks presence separately from content | **A real divergence between the two backends.** `classToString` answers `null` for nullish and `false` — the DOM path calls `removeAttribute` — and `""` for an empty string, array or object, which it assigns to `className`, leaving `class=""` on the element. The string backend omitted the attribute for both, so `class={() => ""}` rendered one attribute on the client and none on the server. `classList` is the other half: `diffClassList` toggles the keys of an object and does nothing whatever with a string or an array, so `classList={"a b"}` wrote a class on the server that the client never writes. `fixtures/class-empty-string.tsx` carries all four shapes. |

### M7's own runtime changes

| change | justification |
|---|---|
| `ssr.ts`: `escapeText`/`escapeAttribute` rewritten as an `indexOf` probe plus a slice-and-append scan | **G1.** They were 3.6x slower than Solid's escaper and were the *entire* SSR deficit — 14.6 of the 15.2 µs a 100-row page cost. Output is byte-identical over 400k+ fuzzed inputs including lone surrogates and astral pairs. |
| `ssr.ts`: `esc` tests `typeof value === "string"` first | **G1.** The commonest case was reached last. |
| `ssr.ts`: `checkName` memoises **accepting** answers, bounded at 1024 | **G1.** The 8.5 ns XML `Name` regex was 42% of `attr("data-id", …)`. Only acceptances are cached and an invalid name always re-runs the regex and throws; a test fills the cache with 2000 names and asserts `bad name` still throws. |
| `ssr.ts`: new `attrLit(name, value)` + `ATTR_INTERCEPTED`, read out of `ssr.ts` by `build.rs` | **A measured 1.5x on an attribute write and 19% on the page.** `spreadAttrs` still calls `attr`, so the M6 attacker-controlled-name fix is untouched, and a test asserts a spread never takes the unvalidated helper. See §5.1 item 7. |
| `dom.ts`: `insert()` writes `textContent` directly for a static primitive, guarded on `text !== ""` | **1.333x per hole in real Chrome.** The sole-occupant fast path already existed in `applyInsert`; the non-function branch always allocated a text node. The guard is required because `textContent = ""` creates no node where `appendChild` creates an empty one, and the oracle creates one. |
| `ssr.test.ts`: a 638-string boundary corpus at 13 lengths straddling the probe gate | **G1's guard rail.** Each string is asserted byte-equal to `renderToString` of the same value in both contexts, with a surrogate pair either side of every escape, plus a lone-surrogate check and an astral-code-point count. 4038 → 6041 `expect()` calls. |

No signature was changed incompatibly across any of the seven milestones. `attr` and `spreadAttrs`
gained an optional third parameter; `rawText` gained an optional second; `attrLit` and `escapeText`/
`escapeAttribute` are new exports; everything else is additive. The two behaviour changes are
`attr()`'s throw on an invalid attribute name (§5.1 item 6) and `clsList`'s `string` →
`string | null` return, whose two callers — `attr`'s `classList` branch and `cls` — are in the same
file and updated with it; the compiler emits `clsList` only as an argument to `cls`.

---

## Appendix — reproducing this report

```
cd packages/compiler-rs
cargo fmt --check
touch src/lib.rs && cargo clippy --all-targets -- -D warnings
cargo test
touch src/lib.rs && bun run build        # every JS number below needs a current .node
bun test
bun test test/ssr.test.ts
bun test test/browser.test.ts
bun run test:browser:parse && bun run test:browser:svg && bun run test:browser:differential
bun test test/throughput.test.ts

cd ../..
bun run test
bun run ci
bash .github/scripts/typecheck.sh
bun install --frozen-lockfile

cd packages/benchmark
bun run bench:dom                # NOT `bun src/dom-head-to-head.ts` — see §5.1 item 8
bun run bench:ssr                # compiles through both real compilers
bun run bench:replace-all --processes=5
bun run bench:shape              # compiler-vs-benchmark drift and the liveness table

cd ../kitchen-sink && bunx vite build
```

Everything else was produced by throwaway scripts written **outside** the repo, in the session
scratchpad: the corpus-wide table in §3, the M1→M7 trend in §4 (which rebuilds `317589b` from
`git archive` into a scratch tree), the Babel comparison in §4 (which restores the deleted plugin
from `git archive 317589b` into a scratch tree with its own `@babel/*`, leaving `bun.lock`
untouched), and the escaper before/after in §6 (which reconstructs the old regex escaper alongside
the shipping one and asserts byte equality per case before timing). Nothing in the tree was modified
while writing this report except this file; `git status` was clean before and shows only this file
after.

**Which numbers are re-measured and which are not.** Every figure in §1, §2, §3, §4 and §5 was
produced by a command run while writing this report. §4's table carries **one** italicised
carried-forward row — the pre-G6 M6 binary — because M5, M6 and M7 all landed in `c70d508` and no
intermediate binary exists to rebuild; it is the G6 pass's own measurement, on the same methodology
as the rows around it.

§6 is different by construction: it is the record of **what milestone 7 did and measured**, so its
one-off figures (the real-Chrome table-reshape and `insert()` trials, `attrLit` in isolation, the
fuzz and mutation counts, the 848- and 1120-compile output diffs) are M7's measurements and are not
re-derived here. What *was* re-derived, from scratch, is every claim those figures support: the G1
escaper before/after and its page number (§6, measured against a reconstructed old escaper with byte
equality asserted per case), the compile-throughput trend (§4), both head-to-heads (§3), the G3
verdict with its CONTROL (§3), the four security probes (§1) and every gate.
