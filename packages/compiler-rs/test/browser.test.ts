import { beforeAll, describe, expect, it } from "bun:test"

import { withChrome } from "./chrome.ts"
import {
  checkParseConformance,
  checkParserAgreement,
  corpus,
  HAZARD_ROWS,
  type Failure,
  type ShapeDivergence,
  type Template,
} from "./browser-parse-check.ts"
import { checkSvgClass, svgClassClaims, type SvgClassResult } from "./browser-svg-class-check.ts"
import { checkDifferential, type DifferentialReport } from "./browser-differential.ts"
import { listBrowserOnlyFixtures, listFixtures } from "./harness.ts"

/**
 * The real-browser half of the suite, inside `bun test` and inside CI.
 *
 * Everything else in this directory runs against happy-dom, whose tree
 * construction is a subset of the real one and which has hidden three separate
 * bug classes on this project already: it does not foster-parent or run the
 * adoption agency (so `lower/parse.rs`'s refusals were unfalsifiable), it hands
 * NUL and CR back unchanged (so `lower/text.rs`'s were too), and it models
 * `SVGElement.className` as a writable string (so O5 stayed green while being
 * broken in every browser). A suite that cannot see those is not a gate.
 *
 * These do NOT skip when Chrome is missing. A browser check that silently does
 * nothing on the machine without a browser is the same failure mode as an
 * assertion that cannot fail — `chrome.ts` throws with the path to set instead.
 * All four run inside ONE Chrome launch and two page loads.
 */

let templates: Template[]
let parseFailures: Failure[]
let disagreements: ShapeDivergence[]
let svg: SvgClassResult
let differential: DifferentialReport
let corrupted: DifferentialReport

beforeAll(async () => {
  templates = corpus()
  await withChrome(async (page) => {
    parseFailures = await checkParseConformance(page, templates)
    disagreements = await checkParserAgreement(page, templates)
    svg = await checkSvgClass(page)
    differential = await checkDifferential(page)
    // The same corpus with one static attribute value rewritten in every
    // emitted module. If this comes back clean, the comparison above is not
    // comparing anything and its green is worth nothing.
    corrupted = await checkDifferential(page, (_name, code) =>
      code.replace(/_\$+template\(`/, (open) => `${open}<u data-corrupted="1"></u>`),
    )
  })
}, 300_000)

describe("real browser: HTML tree construction", () => {
  it("every emitted template parses to exactly one root, with no tag moved", () => {
    expect(templates.length, "the corpus has to reach the browser").toBeGreaterThanOrEqual(40)
    expect(parseFailures).toEqual([])
  })

  it("happy-dom parses every emitted template into the tree Chrome does", () => {
    // The rest of the suite — the effect bounds, the marker channel, the
    // attribute channel and `auditAnchors` — runs on happy-dom alone. A
    // template the two parsers disagree about is one where all of them are
    // measuring a tree no browser builds, and the walk that crosses it resolves
    // to a different node in each. This costs no extra Chrome launch.
    const shown = (rows: ShapeDivergence[]) =>
      rows.map((d) => `${d.fixture}: chrome ${d.chrome} vs happy-dom ${d.fake}`)
    expect(shown(disagreements.filter((d) => !d.fixture.startsWith("browser-only/")))).toEqual([])
    expect(templates.length, "and it ran on the whole corpus").toBeGreaterThanOrEqual(40)

    // The other half: `fixtures/browser-only/` exists BECAUSE the fake parser
    // is wrong there, so a run in which none of them disagrees means either the
    // comparison stopped working or the fixture stopped being browser-only and
    // belongs back in the corpus.
    expect(
      disagreements.filter((d) => d.fixture.startsWith("browser-only/")).length,
      "no browser-only template disagrees any more — this check has gone blind",
    ).toBeGreaterThan(0)
  })

  it("the hazard rows confirm the byte refusals are load-bearing", () => {
    // NUL, CR, and the newline `<pre>`/`<textarea>` eat. happy-dom implements
    // none of that rewriting, so these rows exist only here.
    expect(HAZARD_ROWS).toBeGreaterThanOrEqual(9)
    expect(parseFailures.filter((f) => !templates.some((t) => t.fixture === f.fixture))).toEqual([])
  })
})

describe("real browser: O5, the SVG class branch", () => {
  it("every claim holds against the real SVGElement prototype", () => {
    const broken = svgClassClaims(svg).filter(([, held]) => !held)
    expect(broken.map(([why, , got]) => `${why} — got ${JSON.stringify(got)}`)).toEqual([])
  })

  it("the property shape test/preload.ts installs is the real one", () => {
    // preload.ts shims `SVGElement.className` into a getter returning an
    // SVGAnimatedString because happy-dom makes it writable. This is what says
    // the shim is not fiction.
    expect(svg.probes.classNameHasSetter).toBe(false)
    expect(svg.probes.classNameIsAnimatedString).toBe(true)
  })
})

describe("real browser: the differential comparison", () => {
  it("every fixture renders and drives identically to the oracle in Chrome", () => {
    expect(differential.checked, "every fixture reached the browser").toBe(
      listFixtures().length + listBrowserOnlyFixtures().length,
    )
    expect(
      listBrowserOnlyFixtures().length,
      "the fixtures only a real parser can judge run here and nowhere else",
    ).toBeGreaterThanOrEqual(1)
    expect(differential.frames, "and every frame was driven").toBeGreaterThanOrEqual(140)
    expect(differential.divergences).toEqual([])
  })

  it("the comparison is a detector: a corrupted template goes red", () => {
    // Proof that the green above is a measurement. One extra element in every
    // emitted template, and every fixture that reaches a template has to fail.
    expect(corrupted.divergences.length).toBeGreaterThanOrEqual(40)
    expect(
      new Set(corrupted.divergences.map((d) => d.fixture)).size,
      "one corrupted template, one divergent fixture",
    ).toBeGreaterThanOrEqual(40)
    expect(differential.divergences.length, "and the clean run really was clean").toBe(0)
  })
})
