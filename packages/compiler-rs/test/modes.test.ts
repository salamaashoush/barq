import { describe, expect, it } from "bun:test"

import { MODES, unionFixtures, type Fixture, type ModeId } from "./corpus.ts"
import { compileSource, compileSourceRaw, loadModule, type FixtureModule } from "./harness.ts"
import { renderSourceViaDom, renderSourceViaSsr, sameTree, ssrStatus } from "./ssr.ts"
import { digest, reachRatchet } from "./ratchet.ts"
import { MODE_MATRIX_REACH, MATRIX_EXCEPTIONS } from "./mode-matrix.ts"

/**
 * L5, the mode matrix, over the UNION — `CODESIGN.md` §6 L5 and §12.
 *
 * ## The hole this closes
 *
 * §6 L5 says "every fixture runs in five modes". Every suite that implements it
 * runs over `listFixtures()`, which is `fixtures/*.tsx` and nothing else. The
 * other four directories — 51 more fixture files — have each only ever been
 * compiled the one way their own suite needs:
 *
 *   fixtures/semantics/   L1, DOM, -Ox
 *   fixtures/ownership/   L2b, DOM, -Ox, with `--ownership`
 *   fixtures/l4/          the leak and metamorphic sessions, DOM, -Ox
 *   fixtures/browser-only/ the Chrome differential, DOM, -Ox
 *
 * The `backend!` macro proves every backend has an arm for every `Op`. That is a
 * statement about a match expression. It cannot say whether SSR handles
 * `Op::Region` CORRECTLY for a construct only `fixtures/semantics/` writes, and
 * until this file nothing asked.
 *
 * ## The warning §12 attaches, and what it changed here
 *
 * "Solid's own SSR/DOM hole-id desync was caught by an end-to-end streaming
 * example, NOT by fixture parity, because parity compares COMPILERS rather than
 * backends against each other."
 *
 * A matrix that stopped at "all five modes emitted something" would have missed
 * their bug the same way their parity suite did — and it would have reported a
 * clean sweep, because it does: 182 fixtures x 7 modes compile with zero
 * warnings and zero refusals today. Emission is not the assertion. The two
 * assertions that can see a desync are both here and both run over the union:
 *
 *   1. the two BACKENDS' address tables, diffed against each other from one
 *      source, at three flag settings. `addresses.test.ts` already does this —
 *      over `fixtures/` only, which is 912 of the 1,266 addressed positions in
 *      the union;
 *   2. the two BACKENDS' MARKUP, diffed end to end. Compile for the DOM, render,
 *      serialise; compile for the string backend, render; compare the trees.
 *      That is the shape of the end-to-end example that caught Solid's bug,
 *      generalised from one page to every fixture that can be rendered.
 */

const UNION = unionFixtures()

interface Cell {
  fixture: Fixture
  mode: ModeId
  code: string
  warnings: readonly string[]
}

const CELLS: Cell[] = []
for (const fixture of UNION) {
  for (const mode of MODES) {
    const raw = compileSourceRaw(
      fixture.source,
      fixture.filename,
      mode.options as Record<string, unknown>,
    )
    CELLS.push({ fixture, mode: mode.id, code: raw.code, warnings: raw.warnings })
  }
}

/**
 * Rendered once, here, for the same reason `semantics.test.ts` runs its
 * fixtures once: re-rendering per assertion would be re-running the runtime
 * rather than re-reading the observation. A fixture that cannot be rendered on
 * a path records WHY, and the why is asserted rather than swallowed.
 */
interface Rendered {
  fixture: Fixture
  dom: string | null
  ssr: string | null
  domError: string
  ssrError: string
  declared: string | undefined
}

const RENDERED: Rendered[] = []
for (const fixture of UNION) {
  const tag = `${fixture.family}-${fixture.name}`
  let dom: string | null = null
  let ssr: string | null = null
  let domError = ""
  let ssrError = ""
  try {
    dom = (await renderSourceViaDom(fixture.source, `union-dom-${tag}`)).html
  } catch (error) {
    domError = (error as Error).message.split("\n")[0]
  }
  try {
    ssr = (await renderSourceViaSsr(fixture.source, `union-ssr-${tag}`)).html
  } catch (error) {
    ssrError = (error as Error).message.split("\n")[0]
  }
  // The fixture's own declaration that the two paths legitimately differ, read
  // off the COMPILED module rather than scraped out of the source: `ssrDiffers`
  // is an export and reading it any other way would be a second, drifting
  // implementation of what an export is.
  let declared: string | undefined
  if (dom !== null) {
    const mod = (await loadModule(
      compileSource(fixture.source, fixture.filename),
      `union-decl-${tag}`,
    )) as FixtureModule & { ssrDiffers?: { markup: string; why: string } }
    declared = mod.ssrDiffers?.why
  }
  RENDERED.push({ fixture, dom, ssr, domError, ssrError, declared })
}

const RENDERABLE = RENDERED.filter((r) => r.dom !== null && r.ssr !== null)
const UNRENDERABLE = RENDERED.filter((r) => r.dom === null && r.ssr === null)
const LOPSIDED = RENDERED.filter(
  (r) => (r.dom === null) !== (r.ssr === null),
)

console.log(
  `L5 mode matrix: ${UNION.length} fixtures x ${MODES.length} modes = ${CELLS.length} compiles\n` +
    `  by family: ${[...new Map(UNION.map((f) => [f.family, UNION.filter((g) => g.family === f.family).length]))].map(([k, v]) => `${k}=${v}`).join(" ")}\n` +
    `  backend agreement: ${RENDERABLE.length} fixtures render on BOTH backends, ` +
    `${UNRENDERABLE.length} on neither, ${LOPSIDED.length} on exactly one`,
)

describe("the union compiles in every mode", () => {
  it("the union is every fixture directory, and it is bigger than the one suite most tests use", () => {
    const families = new Set(UNION.map((f) => f.family))
    expect([...families].sort()).toEqual([
      "browser-only",
      "corpus",
      "l4",
      "ownership",
      "semantics",
    ])
    // The number that makes this file worth having: fixtures no suite has ever
    // sent through the string backend or the reference backend.
    const outside = UNION.filter((f) => f.family !== "corpus").length
    expect(outside, "the union adds nothing to fixtures/, so it is not a union").toBeGreaterThan(40)
  })

  it("the reference backend is actually in this build", () => {
    // Detection, never declaration — `differential.ts`'s discipline. An unknown
    // napi option is silently ignored, so a build without `interp` would make
    // the interp column a duplicate of the DOM column and every assertion below
    // would pass while measuring nothing.
    const interp = CELLS.filter((c) => c.mode === "interp")
    const dom = new Map(
      CELLS.filter((c) => c.mode === "dom-Ox").map((c) => [c.fixture.id, c.code]),
    )
    const identical = interp
      .filter((c) => dom.get(c.fixture.id) === c.code)
      .map((c) => c.fixture.id)
      .sort()
    expect(
      identical,
      "a fixture emitted the same module with and without `interp`. Two do, for a reason " +
        "`mode-matrix.ts` records; any other means the option is being ignored and this whole " +
        "column is a copy of the DOM one",
    ).toEqual([...MATRIX_EXCEPTIONS.interpIdentical].sort())
  })

  it("every fixture emits in every mode, with no warning and no refusal", () => {
    const complaints = CELLS.filter((c) => c.warnings.length > 0).map(
      (c) => `${c.fixture.id} @ ${c.mode}: ${c.warnings.join("; ")}`,
    )
    expect(complaints.join("\n")).toBe("")
    const empty = CELLS.filter((c) => c.code.trim().length === 0).map(
      (c) => `${c.fixture.id} @ ${c.mode} emitted nothing`,
    )
    expect(empty.join("\n")).toBe("")
  })

  /**
   * The matrix, locked.
   *
   * One line per fixture, one digest per mode. Any change to any mode's output
   * for any fixture is a diff a reviewer sees, and `bun test --update-snapshots`
   * is the regeneration — which is the same ratchet `known-failures.ts` carries,
   * applied to emission instead of to a claim. A run that improved SSR output
   * for a semantics fixture nobody has ever compiled that way fails here, on
   * purpose, because that is a change nobody asked for and nobody reviewed.
   */
  it("the matrix is locked", () => {
    const byFixture = new Map<string, Map<ModeId, string>>()
    for (const cell of CELLS) {
      let row = byFixture.get(cell.fixture.id)
      if (!row) byFixture.set(cell.fixture.id, (row = new Map()))
      row.set(cell.mode, digest(cell.code))
    }
    const lines = [...byFixture]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, row]) => `${id}  ${MODES.map((m) => row.get(m.id)).join(" ")}`)
    expect(`${MODES.map((m) => m.id).join(" ")}\n${lines.join("\n")}`).toMatchSnapshot()
  })
})

describe("the two backends agree, over the union", () => {
  it("the address tables agree at -Ox, at -O0 and hydratable", () => {
    interface Table {
      positions: Array<{ at: string; kind: string; key: number; start: number; end: number }>
    }
    const rows = (fixture: Fixture, options: Record<string, unknown>): string[] => {
      const raw = compileSourceRaw(fixture.source, fixture.filename, {
        addresses: true,
        ...options,
      })
      const json = raw.addresses
      if (json === undefined || json === null) {
        throw new Error(`${fixture.id}: the build has no \`addresses\` option — P6 has not landed`)
      }
      return (JSON.parse(json) as Table).positions.map(
        (p) => `${p.at} ${p.kind} ${p.key} ${p.start}-${p.end}`,
      )
    }
    const moved: string[] = []
    let addressed = 0
    let outside = 0
    for (const fixture of UNION) {
      for (const level of [{}, { optimize: 0 }, { hydratable: true }]) {
        const dom = rows(fixture, level)
        const ssr = rows(fixture, { ssr: true, ...level })
        addressed += dom.length
        if (fixture.family !== "corpus") outside += dom.length
        if (dom.join("\n") !== ssr.join("\n")) {
          moved.push(
            `${fixture.id} @ ${JSON.stringify(level)}\n` +
              `    dom ${dom.length} positions, ssr ${ssr.length}\n` +
              `    dom only: ${dom.filter((r) => !ssr.includes(r)).join(", ") || "none"}\n` +
              `    ssr only: ${ssr.filter((r) => !dom.includes(r)).join(", ") || "none"}`,
          )
        }
      }
    }
    expect(
      moved.join("\n"),
      "an address set depends on which backend compiled it. This is the desync shape " +
        "`documentation/hole-owner-id-matrix.md` records in Solid's compiler, and H5's channel is " +
        "the typed version of their hand-enforced shared predicate.",
    ).toBe("")
    // A lower bound on each half, so the agreement cannot be satisfied by
    // having nothing to disagree about — and so the UNION's contribution is
    // separately visible from `fixtures/`'s.
    expect(addressed, "the union barely addresses anything").toBeGreaterThan(1000)
    expect(
      outside,
      "the fixtures outside fixtures/ address nothing, so the union adds no address coverage",
    ).toBeGreaterThan(300)
  })

  /**
   * End to end, which is the assertion §12 says fixture parity cannot make.
   *
   * The two backends are run against each other rather than against a shared
   * reference: one source, compiled twice, rendered twice, trees compared.
   * `sameTree` drops comments before comparing, because a `<!---->` is a DOM
   * insert anchor and means nothing on the wire — comparing them would compare
   * the two STRATEGIES rather than the markup.
   */
  it("the markup agrees, and every exception is one the fixture declares", () => {
    const undeclared: string[] = []
    let compared = 0
    let declared = 0
    for (const r of RENDERABLE) {
      const dom = sameTree(r.dom!)
      const ssr = sameTree(r.ssr!)
      if (dom === ssr) {
        compared++
        continue
      }
      if (r.declared !== undefined) {
        declared++
        continue
      }
      if (MATRIX_EXCEPTIONS.browserOnly.includes(r.fixture.id)) {
        declared++
        continue
      }
      undeclared.push(`${r.fixture.id}\n    dom ${dom}\n    ssr ${ssr}`)
    }
    expect(
      undeclared.join("\n"),
      "the DOM backend and the string backend produced different trees for the same source, and " +
        "the fixture does not declare an `ssrDiffers`. Declaring one is a diff a reviewer sees.",
    ).toBe("")
    expect(compared, "nothing was actually compared").toBeGreaterThan(120)
    // The declared exceptions are pinned so that one silently growing into
    // three is a failure. A suite whose exception list can widen without a diff
    // is the failure mode the three known-failure registries exist to prevent.
    expect(declared, "the number of declared SSR divergences moved").toBe(
      MATRIX_EXCEPTIONS.declaredDivergences,
    )
  })

  it("a fixture renders on both backends or on neither, never on exactly one", () => {
    // A fixture that renders for the DOM and throws through the string backend
    // is the single most likely shape for a backend hole, and it is invisible
    // to a suite that only looks at fixtures which render.
    expect(
      LOPSIDED.map(
        (r) =>
          `${r.fixture.id}: dom ${r.dom === null ? `THREW ${r.domError}` : "ok"}, ` +
          `ssr ${r.ssr === null ? `THREW ${r.ssrError}` : "ok"}`,
      ).join("\n"),
    ).toBe("")
  })

  /**
   * The fixtures that render on NEITHER backend, pinned by name.
   *
   * They are the ones whose whole point is to throw — an L1 fixture that
   * asserts a construction-time error, an L4 session driven by the harness
   * rather than by a default export. That is legitimate and `SEMANTICS.md` says
   * so. What is not legitimate is the list growing quietly: a fixture that
   * stopped rendering has left the end-to-end comparison above, and the
   * comparison would go on reporting green with one less subject.
   */
  it("the fixtures that render on neither backend are the ones on the list", () => {
    const observed = UNRENDERABLE.map((r) => r.fixture.id).sort()
    expect(observed).toEqual([...MATRIX_EXCEPTIONS.neither].sort())
  })

  it("the string backend is in this build at all", () => {
    // `ssr.ts` detects the backend rather than trusting the option, and every
    // assertion in this describe is vacuous without it.
    expect(ssrStatus.state, ssrStatus.refusal).toBe("live")
  })
})

describe("the matrix's own reach", () => {
  it("is pinned, and moves in a diff", () => {
    const complaint = reachRatchet({
      channel: "L5 mode matrix",
      expected: MODE_MATRIX_REACH,
      observed: {
        fixtures: UNION.length,
        modes: MODES.length,
        cells: CELLS.length,
        renderableOnBoth: RENDERABLE.length,
        renderableOnNeither: UNRENDERABLE.length,
      },
      file: "test/mode-matrix.ts",
    })
    expect(complaint ?? "").toBe("")
  })
})
