import { describe, expect, it } from "bun:test"

import {
  compileFixture,
  compileFixtureBody,
  compileFixtureRaw,
  compileSource,
  compileSourceRaw,
  countTemplateAnchors,
  emittedCalls,
  fixtureOptimality,
  fixtureSource,
  listFixtures,
  loadModule,
  stripLiterals,
  templateHtml,
} from "./harness.ts"
import { CSS_NUMBER_PROPS } from "./dom-tables.ts"
import { oracleRegistry } from "./oracle-known-failures.ts"
import {
  attributeNameProbeSource,
  comments,
  compileFixtureSsr,
  ESCAPE_CONTEXTS,
  ESCAPE_VALUES,
  escapeProbeSource,
  escapeStaticProbeSource,
  parseFragment,
  RAW_TEXT_TAGS,
  rawTextBakedSource,
  rawTextProbeSource,
  rawTextValues,
  renderCode,
  renderSourceViaDom,
  renderSourceViaOracle,
  renderSourceViaSsr,
  renderSsrCompiled,
  renderSsrOracle,
  renderSsrViaDom,
  RESHAPED_PROBES,
  sameTree,
  ssrChunks,
  ssrStatus,
  type EscapeContext,
} from "./ssr.ts"

/**
 * The dual-render conformance suite — DESIGN §10's M6 deliverable, and target
 * #10's behavioural half.
 *
 * `optimality.test.ts` asserts the SHAPE of the SSR emit: one concatenation, no
 * `document.`, escaped static chunks. This file asserts the only thing that
 * actually protects a user, which is that the string a page ships and the DOM a
 * browser would have built are the same document — because the two backends
 * escape at completely different moments and the SSR one is the one that can be
 * an XSS.
 *
 * WHAT RUNS TODAY. `ssrStatus.landed` is DETECTED, by compiling a probe with
 * `ssr: true` and seeing whether the compiler refuses. Nothing has to be flipped
 * when P8b lands: the pending blocks below become live on that build. Two whole
 * describes are live now regardless, and they are not filler — the oracle
 * comparison proves the specification is a specification, and the compiled-DOM
 * comparison is the first thing in this repo to compare the compiler's template
 * BYTES against the runtime's node building. `oracle.test.ts` cannot: it
 * compares parsed trees, and `&amp;` and `&` parse to the same tree.
 */

const fixtures = listFixtures()

/** Fixtures whose SSR render is compared. Every one of them, with no exception. */
const CORPUS = fixtures

/**
 * The fixtures DESIGN §5's fallback claims, named rather than counted.
 *
 * Every one uses one of the eight flow components that have no string-mode
 * implementation, and the suite asserts the partition in BOTH directions — a
 * fixture leaving this list and a fixture joining it are equally a change to
 * what target #10 delivers, and both have to be a deliberate edit here.
 */
const SSR_FALLBACK = [
  "control-flow-await-suspense",
  "control-flow-error-boundary",
  "control-flow-errored-loading",
  "control-flow-reveal",
  "dynamic",
  "flow-prop-eta-boundary",
  "portal",
]

function report(): void {
  if (ssrStatus.landed) {
    console.log(`SSR conformance: P8b has landed — ${CORPUS.length} fixtures compared live`)
    return
  }
  console.log(
    `SSR conformance: ${CORPUS.length} fixture comparisons and the ${ESCAPE_CONTEXTS.length}×` +
      `${ESCAPE_VALUES.length} escaping matrix are PENDING — the compiler still refuses ` +
      `ssr: true. Reason it gave: ${JSON.stringify(ssrStatus.refusal.split("\n").pop()?.trim())}`,
  )
}
report()

describe("the SSR backend's landing state", () => {
  it("`ssr: true` is either implemented or REFUSED, never quietly ignored", () => {
    // The failure this exists for: `ssr: true` accepted and DOM code emitted.
    // Every claim in this file would then pass — the fixture comparisons trivially
    // (both sides would be the same renderToString of the same node tree) and the
    // escaping matrix trivially (the DOM path cannot have an escaping bug). The
    // suite would report a green SSR backend that does not exist.
    if (!ssrStatus.landed) {
      expect(ssrStatus.refusal, "the refusal has to say what to do instead").toContain("ssr")
      expect(ssrStatus.probe).toBe("")
      return
    }
    const code = ssrStatus.probe
    // `stripLiterals`, not the raw module: an SSR module's whole job is to carry
    // that markup as a STRING, so a bare `toContain` would be asserting the
    // backend does not work.
    expect(stripLiterals(code), "the JSX has to be gone").not.toContain("<section")
    expect(code, "and the markup has to be in a chunk").toContain('<section class="p">hi</section>')
    expect(emittedCalls(code, "template"), "an SSR module clones nothing").toBe(0)
    expect(stripLiterals(code), "and touches no document").not.toContain("document.")
  })

  it("the option reaches the compiler at all", () => {
    // `ssr` is forwarded by the Vite plugin and advertised in the napi surface.
    // An option the compiler silently drops is the exact defect the three
    // component name lists were: accepted, forwarded, and read by nothing.
    const dom = compileSource("const P = () => <b>x</b>;\n", "probe.tsx")
    expect(dom).toContain("_$template(")
    if (!ssrStatus.landed) return
    const ssr = compileSource("const P = () => <b>x</b>;\n", "probe.tsx", { ssr: true })
    expect(ssr).not.toBe(dom)
  })
})

// ---------------------------------------------------------------------------
// the fixture corpus, rendered twice
// ---------------------------------------------------------------------------

const ORACLE_KNOWN = oracleRegistry()

describe("dual render: the whole corpus, string against DOM", () => {
  // LIVE. The compiled DOM module and the un-compiled oracle, both serialised by
  // the same runtime. This is the compile-time half of the escaping rules —
  // what the compiler baked into `_$template(`…`)` against what `createElement`
  // and `setAttribute` produce — and it is a channel `oracle.test.ts` cannot
  // have, because it compares parsed trees and every escaping difference parses
  // away.
  for (const name of CORPUS) {
    it(`${name}: the compiled template bytes serialise like the oracle's nodes`, async () => {
      const registered = ORACLE_KNOWN.get(name)
      const compiled = await renderSsrViaDom(name)
      expect(compiled.string, "the DOM path is never a string").toBe(false)

      if (registered?.ssr) {
        // The reference is un-compiled, so its DECLARATIONS do not take a scope
        // and C1 puts the scope where the author's first parameter is —
        // `oracle-known-failures.ts` states the whole of it. The comparison is
        // still RUN, and it still has to fail: a row that starts agreeing is a
        // row nobody deleted.
        let oracleHtml: string | undefined
        try {
          oracleHtml = (await renderSsrOracle(name)).html
        } catch {
          return
        }
        expect(
          sameTree(compiled.html),
          `STALE: ${name} is registered against ${registered.greenAt} and its reference now ` +
            `agrees — delete the row`,
        ).not.toBe(sameTree(oracleHtml))
        return
      }

      const oracle = await renderSsrOracle(name)
      expect(oracle.string, "the oracle is never a string").toBe(false)
      expect(sameTree(compiled.html), `${name} (compiled DOM) vs oracle`).toBe(sameTree(oracle.html))
    })
  }

  it("the comparison is a detector: an unescaped template goes red", async () => {
    // Proof the green above is a measurement. `escaping-adversarial` bakes
    // `&lt;b&gt;` into its template; a compiler that copied the source bytes
    // through instead would emit a real `<b>` element. That parses into a
    // different TREE — and into the same normalized DOM as far as
    // `oracle.test.ts` is concerned, because it compares what the runtime built
    // against what the template produced and both would then contain a `<b>`.
    const clean = compileFixture("escaping-adversarial")
    const unescaped = clean.replaceAll("&lt;", "<").replaceAll("&gt;", ">")
    expect(unescaped, "self-check corruption is stale").not.toBe(clean)

    const oracle = await renderSsrOracle("escaping-adversarial")
    const good = await renderCode(clean, "esc-detector-clean")
    const bad = await renderCode(unescaped, "esc-detector-raw")

    expect(sameTree(good.html), "the clean module must agree").toBe(sameTree(oracle.html))
    expect(sameTree(bad.html), "and un-escaping it must not").not.toBe(sameTree(oracle.html))
    expect(injected(bad.html).length + parseFragment(bad.html).querySelectorAll("b").length)
      .toBeGreaterThan(0)
  })

  it("every fixture reaches this suite", () => {
    // A corpus filter that silently emptied would report a clean run.
    expect(CORPUS.length).toBe(fixtures.length)
    expect(CORPUS.length).toBeGreaterThanOrEqual(100)
  })
})

describe("dual render: the compiled SSR string", () => {
  const run = ssrStatus.landed ? it : it.todo

  for (const name of CORPUS) {
    run(`${name}: the SSR string is the same document as the DOM the oracle builds`, async () => {
      const registered = ORACLE_KNOWN.get(name)
      // For a registered fixture the reference cannot conform to C1, so the
      // third leg moves rather than disappearing: the compiled SSR string is
      // compared against the compiled DOM module serialised by the same
      // runtime, which is the claim this describe exists to make. What is lost
      // until M9 is only the un-compiled leg, and it is lost for the fixtures
      // named in `oracle-known-failures.ts` and no others.
      const oracle = registered?.ssr ? await renderSsrViaDom(name) : await renderSsrOracle(name)
      const compiled = await renderSsrCompiled(name)
      const declared = (await loadModule(fixtureSource(name), `ssr-decl-${name}`)).ssrDiffers
      if (!declared) {
        expect(sameTree(compiled.html), `${name} (compiled SSR) vs oracle`).toBe(sameTree(oracle.html))
        return
      }
      // A declared divergence is held to the same contract a `win` is: the exact
      // markup, and it must still BE a divergence.
      expect(sameTree(compiled.html), `${name}: ${declared.why}`).toBe(declared.markup)
      expect(
        sameTree(compiled.html),
        `${name}: stale ssrDiffers — the two paths agree now, delete the declaration`,
      ).not.toBe(sameTree(oracle.html))
    })
  }

  run("every declared SSR divergence is one of the three dropped opcodes", async () => {
    // DESIGN §5 drops `Delegate`, `Listen` and `Ref` and nothing else. A fixture
    // may only declare a divergence if it binds one of them — otherwise
    // `ssrDiffers` becomes a way to sign off on any bug at all.
    const unexplained: string[] = []
    for (const name of CORPUS) {
      const mod = await loadModule(fixtureSource(name), `ssr-why-${name}`)
      if (!mod.ssrDiffers) continue
      // Read off the emitted DOM module rather than the fixture source: the
      // question is whether the COMPILER bound one of the three, not whether the
      // author wrote the word somewhere.
      const code = compileFixtureBody(name)
      const clientOnly =
        /\$\$[a-z]+\s*=/.test(stripLiterals(code)) ||
        /_\$+setProp\([^,]+,[^,]+, "(ref|on[A-Z][\w]*)"/.test(code)
      if (!clientOnly) unexplained.push(name)
    }
    expect(unexplained, "declared an SSR divergence with no dropped opcode to explain it").toEqual([])
  })

  run("no compiled SSR string carries an insert anchor", () => {
    // DESIGN §5: `SkelNode::Marker` is skipped entirely. A `<!---->` on the wire
    // is bytes a browser downloads for a DOM operation that never happens.
    //
    // Read out of the CHUNKS, and off the body with the fixture's own
    // `optimality` block stripped. Ten fixtures declare `absent: ["<!---->"]`,
    // and that declaration is source like any other: a substring search over the
    // whole module reports every one of them as a violation and the row becomes
    // a list of fixtures that were right.
    const carried: string[] = []
    for (const name of CORPUS) {
      const code = compileFixtureBody(name, { ssr: true })
      // `countTemplateAnchors`, not `includes`: `marker-literal-text` renders
      // the CHARACTERS `<!---->` inside an attribute, and a substring search
      // cannot tell that from a node. Content is never structure.
      if (countTemplateAnchors(ssrChunks(code).join("")) > 0) carried.push(name)
    }
    expect(carried, "an SSR chunk baked a DOM insert anchor").toEqual([])
  })

  run("a string-mode module does no DOM work", async () => {
    // Target #10's whole claim: zero DOM ops. Asserted on the fixtures that
    // really are inlined, and the PARTITION is asserted too — otherwise a
    // backend that fell back for EVERYTHING would satisfy this by having no
    // string-mode module to check, which a lower bound of forty does not stop.
    const inlined: string[] = []
    for (const name of CORPUS) {
      const render = await renderSsrCompiled(name)
      if (!render.string) continue
      inlined.push(name)
      // Attributable to the COMPILER. `document.` on its own is not: a fixture's
      // own event handler survives into the SSR module as a dead binding for the
      // bundler to remove (DESIGN §7), and `component-function-props` has one
      // that calls `document.querySelector`. Counting the compiler's own helper
      // calls asks the question the target is actually about.
      const code = compileFixtureSsr(name)
      for (const helper of ["template", "insert", "setProp", "createElement", "spread"]) {
        expect(emittedCalls(code, helper), `${name} emitted a DOM ${helper}`).toBe(0)
      }
    }
    expect(inlined.length, "the partition moved").toBe(CORPUS.length - SSR_FALLBACK.length)
  })

  run("the fallback is a documented set, not a silent majority", async () => {
    // DESIGN §5 keeps a happy-dom fallback for the eight flow components that
    // cannot be inlined. That is a stated cost; it is not a licence for the
    // backend to fall back wherever it finds something awkward — and a bound
    // ("every fixture that falls back uses one of the eight") is satisfied by a
    // backend that never falls back AT ALL, which is the other direction of the
    // same bug and is what a mutation proved this row could not see. So the
    // partition is pinned exactly, in both directions.
    const fellBack: string[] = []
    for (const name of CORPUS) {
      const render = await renderSsrCompiled(name)
      if (!render.string) fellBack.push(name)
    }
    expect(fellBack.toSorted(), "the fallback set moved").toEqual(SSR_FALLBACK.toSorted())

    const EIGHT = ["Loading", "Errored", "Reveal", "Suspense", "Await", "Portal", "Dynamic", "ErrorBoundary"]
    for (const name of fellBack) {
      const source = fixtureSource(name)
      expect(
        EIGHT.filter((flow) => new RegExp(`\\b${flow}\\b`).test(source)),
        `${name} fell back with none of the eight in it`,
      ).not.toEqual([])
      // And it SAYS SO. A silent fallback is a page that renders through
      // happy-dom on a server the author believed needed no DOM.
      const { warnings } = compileFixtureRaw(name, { ssr: true })
      expect(
        warnings.filter((w) => w.includes("no string-mode implementation")),
        `${name} fell back without a diagnostic`,
      ).not.toEqual([])
    }
  })

  run("a namespace import cannot walk past either half of the split", () => {
    // `import * as core` binds no symbol for `core.Portal`, so a split resolved
    // by `SymbolId` is blind to it unless the namespace is resolved first — and
    // being blind means compiling the module to a string that calls the real DOM
    // component, which dies with no `document` on the one kind of server target
    // #10 exists for.
    const portal = compileSourceRaw(
      'import * as core from "@barqjs/core";\nexport default () => <div><core.Portal>x</core.Portal></div>;\n',
      "ns.tsx",
      { ssr: true },
    )
    expect(portal.code, "a non-inlinable flow must send the module back to the DOM backend")
      .toContain("_$template(")
    expect(portal.warnings.join("\n")).toContain("Portal")

    const list = compileSource(
      'import * as core from "@barqjs/core";\nexport default () => <div><core.For each={r}>{(i) => <b>{i}</b>}</core.For></div>;\n',
      "ns2.tsx",
      { ssr: true },
    )
    expect(list, "an inlinable flow must still be rewritten").toContain("_$ssrFor(")
    expect(list).not.toContain("core.For")
  })
})

// ---------------------------------------------------------------------------
// the escaping matrix
// ---------------------------------------------------------------------------

/**
 * The safety property, per cell: parse the markup back and the value is still
 * the value.
 *
 * Not "the output contains `&lt;`" — that is a claim about which escaper was
 * chosen. This is a claim about what a browser will do with the bytes, and it is
 * the only one an XSS cannot satisfy.
 */
function roundTrip(html: string, context: EscapeContext): string | null {
  return context.read(parseFragment(html))
}

/** Elements that materialised out of a value that was supposed to be content. */
function injected(html: string): string[] {
  const root = parseFragment(html)
  return Array.from(root.querySelectorAll("img, script, iframe, object, embed, svg")).map(
    (el) => el.localName,
  )
}

/** Attributes a value smuggled in: anything on the probe that is not declared. */
function smuggledAttributes(html: string): string[] {
  const root = parseFragment(html)
  const declared = new Set(["class", "title", "data-value", "data-probe"])
  const out: string[] = []
  for (const el of Array.from(root.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      if (!declared.has(attr.name)) out.push(`${el.localName}[${attr.name}]`)
    }
  }
  return out
}

describe("escaping matrix: the oracle is a sound specification", () => {
  // LIVE, and it runs FIRST for a reason. Everything below compares against
  // `renderToString` over `createElement`, so if that path could itself be
  // fooled by one of these values the whole comparison would be worthless — the
  // compiled path would be allowed to reproduce the hole exactly.
  for (const context of ESCAPE_CONTEXTS) {
    for (const [label, value] of ESCAPE_VALUES) {
      it(`${context.name} / ${label}: survives a round trip through the DOM`, async () => {
        const { html } = await renderSourceViaOracle(
          escapeProbeSource(context, value),
          `oracle-esc-${slug(context.name)}-${slug(label)}`,
        )
        expect(injected(html), "the value became structure").toEqual([])
        expect(smuggledAttributes(html), "the value became attributes").toEqual([])
        expect(roundTrip(html, context)).toBe(normalizeForContext(context, value))
      })
    }
  }
})

describe("escaping matrix: the compiled DOM path agrees, byte for byte", () => {
  // LIVE. Both the dynamic form (the value arrives at runtime, so the runtime
  // escapes) and the STATIC form (the value is a literal the compiler folds into
  // the template HTML, so the COMPILER escapes). The static half is the one that
  // can be got wrong at compile time, and it is the one target #3 creates.
  for (const context of ESCAPE_CONTEXTS) {
    for (const [label, value] of ESCAPE_VALUES) {
      it(`${context.name} / ${label}: dynamic and folded agree with the oracle`, async () => {
        const tag = `${slug(context.name)}-${slug(label)}`

        const dynamicSource = escapeProbeSource(context, value)
        const oracleDynamic = await renderSourceViaOracle(dynamicSource, `od-${tag}`)
        const compiledDynamic = await renderSourceViaDom(dynamicSource, `cd-${tag}`)
        expect(sameTree(compiledDynamic.html), "dynamic").toBe(sameTree(oracleDynamic.html))

        const staticSource = escapeStaticProbeSource(context, value)
        const oracleStatic = await renderSourceViaOracle(staticSource, `os-${tag}`)
        const compiledStatic = await renderSourceViaDom(staticSource, `cs-${tag}`)
        expect(sameTree(compiledStatic.html), "folded").toBe(sameTree(oracleStatic.html))

        expect(injected(compiledStatic.html), "a folded value became structure").toEqual([])
        expect(smuggledAttributes(compiledStatic.html), "a folded value became attributes").toEqual([])
        expect(roundTrip(compiledStatic.html, context), "folded round trip").toBe(
          normalizeForContext(context, value),
        )
      })
    }
  }

  it("the matrix is a detector: un-escaping one folded cell goes red in every channel", async () => {
    // Proof the green cells above are measurements. The mutation is the one
    // a compiler makes by accident — copying the source bytes into the template
    // instead of escaping them — applied to the emitted module so the rest of
    // the pipeline is untouched.
    const context = ESCAPE_CONTEXTS[0]
    const value = '<img src=x onerror="alert(1)">'
    const clean = compileSource(escapeStaticProbeSource(context, value), "probe.tsx")
    const broken = clean.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"')
    expect(broken, "self-check corruption is stale").not.toBe(clean)

    const oracle = await renderSourceViaOracle(escapeStaticProbeSource(context, value), "det-oracle")
    const good = await renderCode(clean, "det-clean")
    const bad = await renderCode(broken, "det-broken")

    expect(sameTree(good.html)).toBe(sameTree(oracle.html))
    expect(sameTree(bad.html), "the tree channel").not.toBe(sameTree(oracle.html))
    expect(injected(bad.html), "the injection channel").toEqual(["img"])
    expect(smuggledAttributes(bad.html), "the attribute channel").not.toEqual([])
    expect(roundTrip(bad.html, context), "the round-trip channel").not.toBe(value)
  })

  it("the folded half really did fold, so the assertions above are about compile-time bytes", () => {
    // Without this the static half is satisfied by a compiler that punted every
    // literal to the patch code, which would move the escaping back to the
    // runtime and out of the compiler's reach — passing the test by not doing
    // the thing the test is about.
    let folded = 0
    for (const context of ESCAPE_CONTEXTS) {
      for (const [, value] of ESCAPE_VALUES) {
        const code = compileSource(escapeStaticProbeSource(context, value), "probe.tsx")
        if (/_\$+template\(`[^`]*[^`\s][^`]*`/.test(code) && emittedCalls(code, "setProp") === 0) {
          folded++
        }
      }
    }
    expect(folded, "no cell folded into a template at all").toBeGreaterThanOrEqual(30)
  })
})

describe("escaping matrix: the compiled SSR string", () => {
  const run = ssrStatus.landed ? it : it.todo

  // WHAT THE CELLS SEE, and what they do not. Every cell below is a PARSE: the
  // value is read back out of the markup, and the markup is compared as a tree.
  // That is the right question for "did the value become structure", and it is
  // blind to any two spellings that parse the same — `&nbsp;` against a raw
  // U+00A0, a surrogate pair against its two halves. Those are asserted as
  // bytes by the row below and by `packages/core/src/ssr.test.ts`; this table
  // is not evidence about the escapers' character set.
  for (const context of ESCAPE_CONTEXTS) {
    for (const [label, value] of ESCAPE_VALUES) {
      run(`${context.name} / ${label}: the string parses back to the same value`, async () => {
        const tag = `${slug(context.name)}-${slug(label)}`
        for (const [kind, source] of [
          ["dynamic", escapeProbeSource(context, value)],
          ["folded", escapeStaticProbeSource(context, value)],
        ] as const) {
          const oracle = await renderSourceViaOracle(source, `so-${kind}-${tag}`)
          const ssr = await renderSourceViaSsr(source, `ss-${kind}-${tag}`)
          expect(injected(ssr.html), `${kind}: the value became structure`).toEqual([])
          expect(smuggledAttributes(ssr.html), `${kind}: the value became attributes`).toEqual([])
          expect(roundTrip(ssr.html, context), `${kind}: round trip`).toBe(
            normalizeForContext(context, value),
          )
          expect(sameTree(ssr.html), `${kind}: against the oracle`).toBe(sameTree(oracle.html))
          expect(comments(ssr.html), `${kind}: an SSR string carries no comment`).toEqual([])
        }
      })
    }
  }

  run("the dynamic half really is dynamic, so it is about the RUNTIME escapers", () => {
    // The counterpart of "the folded half really did fold". Without it, a
    // constant-folding pass that swallowed the dynamic probe would turn every
    // cell above into a duplicate of the folded half and leave `esc`/`attr`
    // untested — which is exactly what a `const VALUE = "…"` probe did.
    let live = 0
    for (const context of ESCAPE_CONTEXTS) {
      for (const [, value] of ESCAPE_VALUES) {
        const code = compileSource(escapeProbeSource(context, value), "probe.tsx", { ssr: true })
        if (/_\$+(esc|attr|attrLit|rawText|content|cls)\(/.test(code)) live++
      }
    }
    expect(live, "every dynamic cell folded away — the runtime escapers are untested").toBe(
      ESCAPE_CONTEXTS.length * ESCAPE_VALUES.length,
    )
  })

  run("the escapers' own BYTES, where a tree comparison is blind", async () => {
    // Two of the escaper's rules cannot survive the cells above, because those
    // compare a parsed TREE: `&nbsp;` and a raw U+00A0 parse to the same
    // character, and a surrogate pair cut in half by a slice boundary reparses
    // as the two halves it was written as. Both mutations — dropping the
    // U+00A0 escape, and cutting between the halves of a pair — left the whole
    // matrix green while `packages/core`'s own suite went red. The bytes are
    // asserted here so the matrix can see its own rules.
    //
    // U+00A0 is escaped in TEXT and left raw in an ATTRIBUTE. That is not a
    // choice: it is what the serialiser behind `renderToString` writes, and the
    // whole point of this file is that the two paths agree byte for byte.
    const value = "a b \u{1f600} & c"
    for (const [kind, make] of [
      ["dynamic", escapeProbeSource],
      ["folded", escapeStaticProbeSource],
    ] as const) {
      const text = await renderSourceViaSsr(make(ESCAPE_CONTEXTS[0], value), `bytes-text-${kind}`)
      expect(text.html, `${kind}: U+00A0 in text is a character reference`).toContain(
        "a&nbsp;b \u{1f600} &amp; c",
      )
      const attribute = await renderSourceViaSsr(make(ESCAPE_CONTEXTS[2], value), `bytes-attr-${kind}`)
      expect(attribute.html, `${kind}: U+00A0 in an attribute stays raw`).toContain(
        'title="a b \u{1f600} &amp; c"',
      )
    }
  })

  run("a value that is markup never reaches the wire unescaped, per context", () => {
    // The byte-level half. It is CONTEXT-AWARE on purpose, because the three
    // contexts do not escape the same characters and a blanket rule would be
    // wrong in two directions at once:
    //
    //   text       `<` opens a tag, so it must not appear raw
    //   attribute  `<` is legal inside a quoted value and `"` is what ends it
    //
    // Requiring `&lt;` inside an attribute would be demanding over-escaping the
    // runtime's own serialiser does not do — and the tree comparison would then
    // fail. Requiring nothing would miss the real hole. So each context is asked
    // the question that is actually dangerous for it.
    const value = '<img src=x onerror="alert(1)">'
    const wrong: string[] = []
    for (const context of ESCAPE_CONTEXTS) {
      const code = compileSource(escapeStaticProbeSource(context, value), "probe.tsx", { ssr: true })
      const quasis = ssrChunks(code).join("")
      // Every branch below asks whether something is IN the chunks, so a module
      // with no chunk at all satisfies all nine — which is how this row stayed
      // green under an identity compiler while its sibling guard went red.
      expect(quasis.length, `${context.name}: no chunk to inspect`).toBeGreaterThan(0)
      const attribute = /attribute/.test(context.name)
      const rawText = /textarea|title|pre/.test(context.name)
      if (attribute) {
        // Inside `title="…"` the value's own `"` is what ends the value, and
        // `<` is legal there — demanding `&lt;` would be demanding
        // over-escaping the runtime's serialiser does not do, and the tree
        // comparison would then be the thing that failed.
        const inValue = quasis.slice(quasis.indexOf("<img"))
        if (inValue.includes('onerror="')) wrong.push(`${context.name}: a raw quote closed the value`)
      } else if (rawText) {
        // Escapable raw text: a tag inside is not a tag, and the only thing that
        // can end the element is its own closing tag.
        const close = `</${context.name.split(",")[0].split(" ")[0]}`
        if (quasis.includes(close.slice(0, -1) + ">")) {
          wrong.push(`${context.name}: the value closed its own element`)
        }
      } else if (quasis.includes("<img")) {
        wrong.push(`${context.name}: a raw tag reached the wire`)
      }
    }
    expect(wrong).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// the two positions a VALUE cell cannot reach
// ---------------------------------------------------------------------------

/** Anything inside `.host` that is not the one probe element it declares. */
function strayInHost(html: string, tag: string): string[] {
  const host = parseFragment(html).querySelector(".host")
  if (host === null) return ["the probe never rendered"]
  const out: string[] = []
  for (const el of Array.from(host.children)) {
    if (el.localName !== tag || !el.className.includes("probe")) out.push(el.localName)
  }
  const probe = host.querySelector(`${tag}.probe`)
  if (probe === null) out.push(`no ${tag}.probe`)
  else for (const el of Array.from(probe.children)) out.push(`${tag}>${el.localName}`)
  return out
}

describe("escaping matrix: raw-text elements, which have no escaping at all", () => {
  const run = ssrStatus.landed ? it : it.todo

  // The gap that let a `</script>` in a value through: every context above puts
  // the hostile value in a position an ENTITY can neutralise, and inside
  // `<script>`/`<style>` there are no entities — the tokenizer decodes nothing.
  // The only defence is neutralising the sequence that ends the element, so the
  // property asserted here is "the value never became structure" rather than a
  // round trip.
  //
  // The oracle is deliberately not the specification here: `renderToString`
  // serialises a text node inside `<script>` verbatim, so its own bytes reparse
  // into a breakout. That is a property of HTML serialisation, not something
  // this compiler can fix, and it is exactly why comparing against it would have
  // let the bug through.
  for (const tag of RAW_TEXT_TAGS) {
    for (const [label, value] of rawTextValues(tag)) {
      run(`${tag} / ${label}: the value cannot end its own element`, async () => {
        const slugged = `${tag}-${slug(label)}`
        const ssr = await renderSourceViaSsr(rawTextProbeSource(tag, value), `rt-${slugged}`)
        expect(strayInHost(ssr.html, tag), "the value escaped its element").toEqual([])
        expect(smuggledAttributes(ssr.html), "the value became attributes").toEqual([])
      })
    }
  }

  run("the same holds for content the COMPILER baked, not just runtime values", async () => {
    // JSX text cannot hold a bare `<`, but `&lt;/script&gt;` is ordinary JSX
    // text and the compiler decodes it before baking — which is how a literal
    // reaches the wire as the one sequence that ends the element.
    for (const tag of RAW_TEXT_TAGS) {
      const encoded = `a &lt;/${tag}&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt; b`
      const ssr = await renderSourceViaSsr(rawTextBakedSource(tag, encoded), `rtb-${tag}`)
      expect(strayInHost(ssr.html, tag), `${tag}: a baked literal escaped its element`).toEqual([])
    }
  })

  run("this is a detector: un-neutralising the baked bytes goes red", async () => {
    // Proof the green above is a measurement, in the same style as the folded
    // detector: the mutation is applied to the emitted module, so the rest of
    // the pipeline is untouched.
    const encoded = "a &lt;/script&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt; b"
    const clean = compileSource(rawTextBakedSource("script", encoded), "probe.tsx", { ssr: true })
    const broken = clean.replaceAll("<\\\\/", "</")
    expect(broken, "self-check corruption is stale — nothing was neutralised").not.toBe(clean)

    const good = await renderCode(clean, "rt-det-clean")
    const bad = await renderCode(broken, "rt-det-broken")
    expect(strayInHost(good.html, "script")).toEqual([])
    expect(strayInHost(bad.html, "script"), "the breakout channel").not.toEqual([])
    expect(injected(bad.html), "the injection channel").toContain("img")
  })

  run("the owning tag travels with the value, so the runtime knows what ends it", () => {
    for (const tag of RAW_TEXT_TAGS) {
      const code = compileSource(rawTextProbeSource(tag, "x"), "probe.tsx", { ssr: true })
      expect(code, `${tag}: rawText lost its owner`).toMatch(
        new RegExp(`_\\$+rawText\\(.*, "${tag}"\\)`),
      )
    }
  })
})

describe("the lean attribute helper", () => {
  const run = ssrStatus.landed ? it : it.todo

  interface ServerAttrs {
    attr: (name: string, value: unknown, tag?: string) => string
    attrLit: (name: string, value: unknown) => string
    attrIntercepts: (name: string) => boolean
  }

  /**
   * Names a JSX attribute can spell, spanning both sides of the split: the
   * ordinary ones, every family `attr` decides about itself, an `on…` prefix
   * that is not an event name, and the two `$`-leading spellings JSX admits and
   * the XML `Name` production does not.
   */
  const NAMES = [
    "id", "title", "href", "src", "alt", "placeholder", "width", "type", "role", "lang",
    "data-id", "data-x-y", "aria-label", "xlink:href", "tabindex", "colspan", "disabled",
    "class", "classList", "style", "value", "className", "htmlFor",
    "defaultValue", "defaultChecked", "readOnly",
    "children", "ref", "key", "checked", "selected", "indeterminate",
    "innerHTML", "innerText", "textContent", "dangerouslySetInnerHTML",
    "onClick", "once", "only",
    "$flag", "$",
  ]

  const VALUES: unknown[] = [
    "x", "", "a\"b&c<d>", 0, 7, -1, true, false, null, undefined,
    { a: 1, b: 0 }, ["a", "b"], () => "thunk", () => null,
  ]

  run("the compiler emits it for exactly the names the runtime says are safe", async () => {
    // The compiler re-derives `attr`'s decision from the literal name at
    // compile time — the table off `ssr.ts`, the `on…` prefix, and the XML
    // `Name` production `setAttribute` validates against. This is the two
    // halves being asked the same question: a name where the compiler is
    // LOOSER than the runtime writes an attribute the DOM path refuses, which
    // is the shape of the M6 spread bug.
    // Through `unknown`: the `./server` subpath's `types` point at `dist/`,
    // which is a build artifact, so a clean tree has no declaration for the two
    // newest exports even though the module really does have them.
    const core = (await import("@barqjs/core/server")) as unknown as ServerAttrs

    const disagreed: string[] = []
    for (const name of NAMES) {
      const code = compileSource(
        `export default () => <div ${name}={v()} />;\n`,
        "probe.tsx",
        { ssr: true },
      )
      const lean = new RegExp(`_\\$+attrLit\\(${JSON.stringify(name)},`).test(code)
      let valid = true
      try {
        core.attr(name, "x", "div")
      } catch {
        valid = false
      }
      const safe = !core.attrIntercepts(name) && !name.startsWith("on") && valid
      if (lean !== safe) disagreed.push(`${name}: compiler ${lean}, runtime ${safe}`)
    }
    expect(disagreed, "the compiler's rule and the runtime's disagree").toEqual([])

    // Both directions are really reached, so neither clause above is vacuous.
    expect(NAMES.filter((n) => !core.attrIntercepts(n)).length).toBeGreaterThan(10)
    expect(NAMES.filter((n) => core.attrIntercepts(n)).length).toBeGreaterThan(10)
  })

  run("and where it is emitted, it writes byte for byte what attr writes", async () => {
    // Through `unknown`: the `./server` subpath's `types` point at `dist/`,
    // which is a build artifact, so a clean tree has no declaration for the two
    // newest exports even though the module really does have them.
    const core = (await import("@barqjs/core/server")) as unknown as ServerAttrs

    const wrong: string[] = []
    let compared = 0
    for (const name of NAMES) {
      if (core.attrIntercepts(name) || name.startsWith("on")) continue
      for (const tag of ["div", "input", "option", "textarea", "select", "svg"]) {
        for (const value of VALUES) {
          let expected: string
          try {
            expected = core.attr(name, value, tag)
          } catch {
            continue
          }
          compared++
          const got = core.attrLit(name, value)
          if (got !== expected) {
            wrong.push(`${name} on <${tag}> with ${JSON.stringify(String(value))}: ` +
              `${JSON.stringify(got)} vs ${JSON.stringify(expected)}`)
          }
        }
      }
    }
    expect(wrong, "attrLit is not attr for a name the compiler hands it").toEqual([])
    expect(compared, "the comparison ran on nothing").toBeGreaterThan(500)
  })

  run("a spread still goes through attr, so a hostile key is still refused", () => {
    // The M6 fix. `attrLit` does not validate a name, and it never has to: the
    // only position where a name is runtime data is a spread's own keys, and
    // that position keeps `attr`.
    const code = compileSource(
      'export default () => <div class="probe" {...props} />;\n',
      "probe.tsx",
      { ssr: true },
    )
    expect(code).toContain("spreadAttrs")
    expect(code, "a spread must not take the unvalidated helper").not.toContain("attrLit")
  })
})

describe("escaping matrix: a hostile attribute NAME", () => {
  const run = ssrStatus.landed ? it : it.todo

  run("a spread key that is not a valid attribute name is refused, never written", async () => {
    // The only position in the whole surface where a NAME is runtime data: every
    // compiled `attr(…)` call site passes a name the compiler wrote, and a
    // spread passes the object's own keys. `setAttribute` answers an invalid
    // name with `InvalidCharacterError` and writes nothing, so a string backend
    // that wrote the bytes would turn `{"x onload=alert(1) y": "1"}` into three
    // attributes — markup the DOM path cannot produce.
    const wrote: string[] = []
    const laxer: string[] = []
    for (const [label, value] of ESCAPE_VALUES) {
      const source = attributeNameProbeSource(value)
      const tag = slug(label)
      const oracle = await attempt(renderSourceViaOracle(source, `an-o-${tag}`))
      const ssr = await attempt(renderSourceViaSsr(source, `an-s-${tag}`))
      // Never the unsafe side: where the DOM refuses, the string must refuse.
      if (oracle === null && ssr !== null) laxer.push(label)
      if (ssr !== null && smuggledAttributes(ssr).length > 0) wrote.push(label)
    }
    expect(wrote, "a hostile key reached the wire as attributes").toEqual([])
    expect(laxer, "SSR accepted a name setAttribute refuses").toEqual([])
  })

  run("and a legitimate spread key still writes its attribute", async () => {
    // The positive control. Without it "refuse everything" passes the row above.
    const source = attributeNameProbeSource("data-x")
    const ssr = await renderSourceViaSsr(source, "an-ok")
    const oracle = await renderSourceViaOracle(source, "an-ok-oracle")
    expect(parseFragment(ssr.html).querySelector(".probe")?.getAttribute("data-x")).toBe("1")
    expect(sameTree(ssr.html)).toBe(sameTree(oracle.html))
  })
})

describe("escaping matrix: the JSX the parser reshapes, escaped at COMPILE time", () => {
  const run = ssrStatus.landed ? it : it.todo

  // `ssr.rs::bake_text` and `bake_attribute` — the compiler's escapers for the
  // subtrees P1 refuses to inline (a table, whose children the parser
  // foster-parents). Nothing else in this file reaches them: an accepted subtree
  // is escaped through the skeleton, and a value in a refused subtree is escaped
  // by the runtime. Deleting the escape from both used to leave every suite
  // green while turning server-rendered markup into an injection.
  for (const probe of RESHAPED_PROBES) {
    run(`${probe.name}: the bytes match the oracle and stay content`, async () => {
      const tag = slug(probe.name)
      const oracle = await renderSourceViaOracle(probe.source, `rs-o-${tag}`)
      const ssr = await renderSourceViaSsr(probe.source, `rs-s-${tag}`)
      expect(injected(ssr.html), "a baked literal became structure").toEqual([])
      expect(smuggledAttributes(ssr.html), "a baked literal became attributes").toEqual([])
      const root = parseFragment(ssr.html)
      // Off `.host`: the characters are foster-parented out of the table by a
      // conforming parser and stay inside it by a lenient one, and the property
      // — still content, still exactly these characters — is the same either way.
      expect(root.querySelector(".host")?.textContent, "the text round trip").toBe(probe.text)
      expect(
        root.querySelector(".probe")?.getAttribute("title"),
        "the attribute round trip",
      ).toBe(probe.title)
      expect(sameTree(ssr.html), "against the oracle").toBe(sameTree(oracle.html))
    })
  }

  run("the refusal is real: this markup never reached a template", () => {
    // If P1 started accepting these tables the probes would exercise the
    // skeleton escapers instead, and `bake_text` would be uncovered again with
    // the suite still green. That is not hypothetical — it is what happened the
    // day a table ROW became legal at a template root, which is why the shape
    // here is one no position can rescue.
    for (const probe of RESHAPED_PROBES) {
      const code = compileSource(probe.source, "probe.tsx")
      expect(emittedCalls(code, "createElement"), probe.name).toBeGreaterThan(0)
      expect(templateHtml(code).join(""), `${probe.name}: the table reached a template`)
        .not.toContain("<table")
    }
  })

  run("this is a detector: un-escaping the baked bytes goes red in every channel", async () => {
    const probe = RESHAPED_PROBES[0]
    const clean = compileSource(probe.source, "probe.tsx", { ssr: true })
    const broken = clean
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&amp;", "&")
    expect(broken, "self-check corruption is stale").not.toBe(clean)

    const oracle = await renderSourceViaOracle(probe.source, "rs-det-oracle")
    const good = await renderCode(clean, "rs-det-clean")
    const bad = await renderCode(broken, "rs-det-broken")
    expect(sameTree(good.html)).toBe(sameTree(oracle.html))
    expect(sameTree(bad.html), "the tree channel").not.toBe(sameTree(oracle.html))
    expect(injected(bad.html), "the injection channel").toContain("script")
    expect(smuggledAttributes(bad.html), "the attribute channel").not.toEqual([])
  })
})

async function attempt(render: Promise<{ html: string }>): Promise<string | null> {
  try {
    return (await render).html
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// the emit itself
// ---------------------------------------------------------------------------

describe("SSR emit shape", () => {
  const run = ssrStatus.landed ? it : it.todo

  run("static-only: one concatenation, no template, no document", () => {
    const code = compileFixtureBody("static-only", { ssr: true })
    expect(stripLiterals(code), "the JSX has to be gone").not.toContain("<section")
    expect(code).toMatch(/`<section class="card"/)
    expect(stripLiterals(code)).not.toContain("document.")
    expect(emittedCalls(code, "template")).toBe(0)
  })

  run("html-entities: text is escaped at COMPILE time", () => {
    const code = compileFixtureBody("html-entities", { ssr: true })
    expect(code, "the JSX has to be gone").not.toBe(fixtureSource("html-entities"))
    expect(code).toContain("&lt;")
    expect(code).toContain("&amp;")
  })

  run("a literal style object folds with the px rule dom.ts declares, key by key", async () => {
    // The check `tables.test.ts` cannot have. CSS_NUMBER_PROPS is the one table
    // whose drift produces wrong PIXELS rather than a wrong node, and on the DOM
    // target it is unobservable: the object is handed to the runtime whole, so
    // the compiler never has to decide about `px`. The SSR backend folds a
    // literal style object into the `style="…"` chunk — markup has one slot and
    // no CSSOM — which is the moment the decision becomes the compiler's and the
    // moment a stale table becomes visible.
    //
    // Read out of `dom.ts` on disk, not transcribed, and compared against the
    // runtime's own answer for the same object — so this fails whether the
    // compiler's rule is wrong or its TABLE has drifted from the runtime's.
    const wrong: string[] = []
    for (const prop of [...CSS_NUMBER_PROPS, "width", "height", "margin-top"]) {
      const source = `export default () => <div style={{ ${JSON.stringify(prop)}: 2 }} />;\n`
      // The POSITIVE clause: the bytes are in the module, not in a call the
      // runtime makes. Without it the row compares the runtime's answer with
      // the runtime's answer and no table can ever drift out of agreement.
      const code = compileSource(source, "probe.tsx", { ssr: true })
      if (emittedCalls(code, "attr") !== 0) wrong.push(`${prop}: punted to the runtime`)
      if (!ssrChunks(code).join("").includes("style=")) wrong.push(`${prop}: never reached a chunk`)
      const ssr = await renderSourceViaSsr(source, `style-${slug(prop)}`)
      const dom = await renderSourceViaOracle(source, `style-oracle-${slug(prop)}`)
      const want = parseFragment(dom.html).querySelector("div")?.getAttribute("style") ?? ""
      const got = parseFragment(ssr.html).querySelector("div")?.getAttribute("style") ?? ""
      // The px RULE, isolated from CSSOM. A shorthand like `flex` is expanded by
      // the browser's own style parser into three longhands the moment the
      // runtime assigns it, and no compile-time serialiser can or should
      // reproduce that. What both paths must agree on is the one thing this
      // table decides: whether the number gets a unit.
      const unit = (style: string) => /\d(px)?\b/.exec(style)?.[1] ?? ""
      if (unit(want) !== unit(got)) {
        wrong.push(`${prop}: runtime ${JSON.stringify(want)} vs SSR ${JSON.stringify(got)}`)
      }
    }
    expect(CSS_NUMBER_PROPS.length, "the table came out empty — this check is stale").toBeGreaterThan(9)
    expect(wrong, "the compiler's px rule disagrees with dom.ts").toEqual([])
  })

  run("O9: the SSR chunks double a leading newline, byte for byte", async () => {
    // The dual render cannot see this one. `sameTree` canonicalises the leading
    // newline run on BOTH sides, because the loss is in the serialiser and is
    // present on every engine — so a string backend that stopped doubling, or
    // dropped the newline outright, still compares equal to the oracle. The DOM
    // half of O9 is pinned by `compile.rs`'s two tests over the emitted
    // template; this is the same pin on the string half.
    //
    // The needles are the FIXTURE's own, so the two halves cannot drift apart.
    const decl = await fixtureOptimality("pre-leading-newline")
    const chunks = ssrChunks(compileFixtureSsr("pre-leading-newline")).join("")
    expect(chunks, "no chunk to inspect").not.toBe("")
    expect(decl?.emits?.length ?? 0, "the fixture's declaration went empty").toBeGreaterThan(0)
    expect(decl?.absent?.length ?? 0, "the fixture's declaration went empty").toBeGreaterThan(0)
    for (const needle of decl?.emits ?? []) {
      expect(chunks, `the SSR string must emit ${JSON.stringify(needle)}`).toContain(needle)
    }
    for (const needle of decl?.absent ?? []) {
      expect(chunks, `the SSR string must not emit ${JSON.stringify(needle)}`).not.toContain(needle)
    }
  })

  run("O9: a hole in a newline-eating element is given a newline to lose", () => {
    // The other half of O9, and the half `sameTree` is structurally unable to
    // see — it canonicalises the leading run on BOTH sides, so a string backend
    // that dropped this newline compares equal to the oracle for ever.
    //
    // A template's hole materialises nothing, so the parser's U+000A lands on
    // the text behind it and the DOM rule looks past the hole. A string's hole
    // writes the VALUE's bytes against the open tag, and the compiler cannot
    // see their first one: `<pre>` + "\nfirst line" is markup real Chrome
    // parses to "first line" (`browser-parse-check.ts`, `pre eats a lone
    // newline`), where `insert` builds the text node whole. So the compiler
    // owes the parser a newline of its own — and `pre keeps a DOUBLED newline`
    // is the row that says one is exactly enough.
    const chunk = (source: string) =>
      ssrChunks(compileSource(source, "probe.tsx", { ssr: true })).join(" ")

    // The value cannot be seen, so the guard is unconditional…
    expect(chunk("export default () => <pre>{v()}</pre>;\n")).toBe("<pre>\n </pre>")
    // …including where the value may render EMPTY and leave the literal behind
    // it against the tag. That literal is then NOT doubled: the guard is the
    // byte the parser eats, and doubling would put a real blank line in.
    expect(chunk("export default () => <pre>{v()}&#10;tail</pre>;\n")).toBe(
      "<pre>\n \ntail</pre>",
    )
    // A `<textarea>` holding a hole is JSX P1 refuses, so it reaches the wire
    // through the other serialiser in codegen/ssr.rs — and it is the shape that
    // hurts most, because the DOM path is `createElement`, whose text node no
    // parser ever reads.
    expect(chunk("export default () => <textarea>{v()}</textarea>;\n")).toBe(
      "<textarea>\n </textarea>",
    )
    // A content prop owns the whole child position and is just as unknown.
    expect(chunk("export default () => <pre textContent={v()} />;\n")).toBe("<pre>\n </pre>")

    // And nowhere else. A literal that already leads with a newline doubles and
    // gets no second guard; an element and a non-newline literal write their own
    // first byte; a tag the parser has no rule for is left alone.
    expect(chunk("export default () => <pre>&#10;a</pre>;\n")).toBe("<pre>\n\na</pre>")
    expect(chunk("export default () => <pre><b>x</b>{v()}</pre>;\n")).toBe(
      "<pre><b>x</b> </pre>",
    )
    expect(chunk("export default () => <pre>x{v()}</pre>;\n")).toBe("<pre>x </pre>")
    expect(chunk("export default () => <div>{v()}</div>;\n")).toBe("<div> </div>")

    // The DOM backend answers the same question differently, and that is the
    // point: its hole is not in the template at all, so the newline it doubles
    // is the one on the text BEHIND the hole.
    expect(templateHtml(compileSource("export default () => <pre>{v()}</pre>;\n", "probe.tsx")))
      .toEqual(["<pre></pre>"])
    expect(
      templateHtml(compileSource("export default () => <pre>{v()}&#10;t</pre>;\n", "probe.tsx")),
    ).toEqual(["<pre>\n\nt</pre>"])
  })

  run("a delegated handler is dropped, and leaves no empty quasi behind", () => {
    // DESIGN §5's opcode table: `Delegate`/`Listen`/`Ref` are dropped, and no cut
    // is made where they were, so `<button class="btn">Bump` stays ONE quasi.
    const code = compileSource(
      'const h = () => {};\nexport default () => <button class="btn" onClick={h}>Bump</button>;\n',
      "probe.tsx",
      { ssr: true },
    )
    expect(code).not.toContain("$$click")
    expect(code).not.toContain("addEventListener")
    expect(code).toMatch(/`<button class="btn">Bump<\/button>`/)
  })
})

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

/**
 * What the value looks like after the browser has read it back.
 *
 * `<textarea>` and `<pre>` eat one leading newline (the HTML parser's rule, and
 * the reason DESIGN O9 makes the skeleton emit `&#10;`), and nothing else here
 * changes. Stated as a function rather than folded into the values so the table
 * stays a table of BYTES and the parser's rules stay in one place.
 */
function normalizeForContext(context: EscapeContext, value: string): string {
  if (!/pre|textarea/.test(context.name)) return value
  return value.startsWith("\n") ? value.slice(1) : value
}
