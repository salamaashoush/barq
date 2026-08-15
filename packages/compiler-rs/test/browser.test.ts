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
import { checkCaret, formatCaret, type CaretReport } from "./browser-caret-check.ts"
import { listBrowserOnlyFixtures, listFixtures } from "./harness.ts"
import { ORACLE_FAILURES } from "./oracle-known-failures.ts"

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
let reordered: DifferentialReport
let truncated: DifferentialReport
let unanchored: DifferentialReport
let caret: CaretReport

/**
 * The un-compiled reference cannot conform to C1, and Chrome sees exactly what
 * happy-dom sees: `oracle-known-failures.ts` holds the whole argument and
 * `oracle.test.ts` holds each fixture to a stated set of channels. Here the
 * registry does one job — it partitions the report, so "the clean run really
 * was clean" is a claim about everything else and stays an equality.
 */
const EXPLAINED = new Set(ORACLE_FAILURES.map((row) => row.fixture))

function unexplained(report: DifferentialReport): DifferentialReport["divergences"] {
  return report.divergences.filter((d) => !EXPLAINED.has(d.fixture))
}

/** Reverse the attribute order every template bakes in, exactly as oracle.test.ts does. */
function reverseBakedAttributes(code: string): string {
  return code.replace(/(_\$+template\(`)([\s\S]*?)(`)/g, (_m, open, html: string, close) =>
    open +
    html.replace(/<([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+="[^"]*"){2,})/g, (_match, tag, attrs: string) => {
      const pairs = [...attrs.matchAll(/\s+([^\s=>/]+="[^"]*")/g)].map((p) => p[1])
      return `<${tag} ${pairs.reverse().join(" ")}`
    }) +
    close,
  )
}

/**
 * Keep only the first scripted step, so the compiled run produces fewer frames.
 *
 * The array is RENAMED and re-exported truncated rather than rewritten in place:
 * a fixture's steps are arbitrary JS across arbitrary lines, and a regex that
 * tries to cut one out of the middle produces a module that does not parse — at
 * which point every fixture reports `threw` and the row measures nothing.
 */
function dropLaterSteps(code: string): string {
  if (!code.includes("export const steps = ")) return code
  return `${code.replace("export const steps = ", "const _stepsAll = ")}
export const steps = _stepsAll.slice(0, 1);
`
}

/** Drop the third argument of every `_$insert`, so the compiled path appends. */
function dropInsertAnchors(code: string): string {
  return code.replace(/(_\$+insert\([\s\S]*?), (_el\$+\d+)\)/g, "$1)")
}

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
    // And the same corpus with every template's attributes emitted backwards.
    // Rule 2 of normalize.ts sorts them out of the DOM diff, so this is
    // invisible to `initial-dom` and can only be caught by the order channel —
    // which is the one that used to run under happy-dom alone.
    reordered = await checkDifferential(page, (_name, code) => reverseBakedAttributes(code))
    // Every compiled module driven through ONE step instead of all of them. Both
    // frame loops in the page are bounded by the MINIMUM of the two lengths, so
    // a compiled run that stopped part-way compared only the prefix and reported
    // a clean sheet; the counts are what see it.
    truncated = await checkDifferential(page, (_name, code) => dropLaterSteps(code))
    // And the anchor argument removed from every `insert`, which makes the
    // compiled path append exactly the way `createElement` does — so the
    // fixtures that declare a `win` stop winning. A declared win that stopped
    // describing reality is worse than no win, because it disarms that frame's
    // comparison for good.
    unanchored = await checkDifferential(page, (_name, code) => dropInsertAnchors(code))
    // B7, and the only channel in this repository that can type. See
    // browser-caret-check.ts for why a `dispatchEvent` cannot.
    caret = await checkCaret(page)
  })
}, 600_000)

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
    // One disagreement is admitted, and only one: the U+000A a conforming
    // parser ignores after `<pre>`/`<textarea>`/`<listing>`. It moves no node
    // and reorders nothing, so no walk can be fooled by it — it changes the
    // CHARACTERS of one text node, which is why `normalize.ts` canonicalises
    // exactly that run on this engine and nothing else. The three hazard rows
    // below are the measurement that the rule is real in Chrome.
    expect(
      shown(
        disagreements.filter(
          (d) => !d.fixture.startsWith("browser-only/") && !d.leadingNewlineOnly,
        ),
      ),
    ).toEqual([])
    expect(templates.length, "and it ran on the whole corpus").toBeGreaterThanOrEqual(40)

    // And the admitted one is really reached, so the clause above is not a
    // permission nobody uses: `pre-leading-newline` carries the shape.
    expect(
      disagreements.filter((d) => d.leadingNewlineOnly).length,
      "no template disagrees by the leading newline any more",
    ).toBeGreaterThan(0)

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
    expect(unexplained(differential)).toEqual([])
    // And the registry is exact in the real browser too: a row that stopped
    // diverging here is a row nobody deleted, and a row that never diverged
    // here was registered for something Chrome cannot see.
    expect(
      [...new Set(differential.divergences.map((d) => d.fixture))].sort(),
      "the registered set is what diverges in Chrome, no more and no less",
    ).toEqual([...EXPLAINED].sort())
  })

  it("the attribute-order channel runs in the real parser, and it is live", () => {
    // Attribute order in the compiled path is decided by the HTML PARSER
    // reading the template, which is precisely the component happy-dom is not.
    // The channel therefore has to run here, and it has to be doing work: a
    // channel that produced no lines would report no divergences and read as a
    // clean run.
    expect(differential.attributeLines).toBeGreaterThanOrEqual(120)
    expect(differential.divergences.filter((d) => d.kind === "attribute-order")).toEqual([])

    // The detector half. Emitting every template's attributes backwards is
    // invisible to the DOM diff — rule 2 of normalize.ts sorts them — so every
    // divergence this produces has to come from the order channel.
    const kinds = new Set(unexplained(reordered).map((d) => d.kind))
    expect([...kinds]).toEqual(["attribute-order"])
    expect(
      new Set(unexplained(reordered).map((d) => d.fixture)).size,
      "several fixtures bake two or more attributes into one tag",
    ).toBeGreaterThanOrEqual(3)
  })

  it("a compiled run that produces FEWER frames is a divergence, not a short comparison", () => {
    // Both frame loops are bounded by the minimum of the two lengths, so a
    // compiled module that stopped driving simply had less compared and came
    // back clean. This is the count that turns that into a failure.
    const counts = truncated.divergences.filter((d) => d.kind === "step-count")
    expect(counts.length, "no fixture reported a step-count divergence").toBeGreaterThanOrEqual(10)
    expect(
      new Set(counts.map((d) => d.fixture)).size,
      "one truncated module, one divergent fixture",
    ).toBeGreaterThanOrEqual(10)
    expect(unexplained(differential).length, "and the clean run really was clean").toBe(0)
  })

  it("a declared win that stopped being a win is reported as STALE", () => {
    // A `win` permanently disarms one frame's comparison, so a note that stopped
    // describing reality is worse than no note at all. Removing every insert
    // anchor makes the compiled path append exactly as `createElement` does,
    // which is precisely what the corpus's wins are declared ABOUT — so every
    // one of them has to go stale.
    const stale = unanchored.divergences.filter((d) => d.kind === "stale-win")
    expect(stale.length, "no win went stale under a mutation that removes the win").toBeGreaterThanOrEqual(1)
    expect(
      unexplained(differential).filter((d) => d.kind === "stale-win" || d.kind === "unmet-win"),
      "and no win is stale or unmet on the clean run",
    ).toEqual([])
  })

  it("the comparison is a detector: a corrupted template goes red", () => {
    // Proof that the green above is a measurement. One extra element in every
    // emitted template, and every fixture that reaches a template has to fail.
    expect(unexplained(corrupted).length).toBeGreaterThanOrEqual(40)
    expect(
      new Set(unexplained(corrupted).map((d) => d.fixture)).size,
      "one corrupted template, one divergent fixture",
    ).toBeGreaterThanOrEqual(40)
    expect(unexplained(differential).length, "and the clean run really was clean").toBe(0)
  })
})

describe("real browser: the caret (B7)", () => {
  it("survives a write that arrives while the user is typing", () => {
    console.log(`caret, typed through CDP:\n${formatCaret(caret)}`)
    expect(caret.rows.length, "the caret check has to drive something").toBeGreaterThanOrEqual(3)
    expect(
      caret.rows.filter((row) => !row.ok).map((row) => `${row.target}: ${row.why}`),
      "B7: a write that lands on a focused control restores the selection and keeps the focus",
    ).toEqual([])
  })

  it("and the check can see the loss — the mutated channel destroys it", () => {
    // Without this row the one above is satisfied by a browser that never
    // moved the caret in the first place, which is exactly the shape a
    // synthetic `dispatchEvent` suite has.
    expect(
      caret.control.ok ? "" : caret.control.why,
      "the control runs a bindValue with neither the compare nor the restore; if THAT keeps the " +
        "caret then this whole check is measuring nothing",
    ).toBe("")
  })
})
