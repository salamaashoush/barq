import { describe, expect, it } from "bun:test"

import { listFixtures, renderViaCompiler } from "./harness.ts"
import {
  duplicateEffectRows,
  EFFECT_COUNTS,
  effectCounts,
  formatEffectRow,
  type EffectCount,
} from "./effect-counts.ts"

const fixtures = listFixtures()
const TABLE = effectCounts()
const PRINT = process.env.BARQ_EFFECTS === "print"

async function measure(name: string): Promise<EffectCount> {
  const render = await renderViaCompiler(name)
  return {
    fixture: name,
    created: render.trace.created,
    runs: render.trace.totalRuns,
    busiest: render.runs.reduce((n, r) => Math.max(n, r), 0),
    frames: 1 + render.frames.length + render.eventFrames.length,
  }
}

describe("L4 — effect counts, graded absolutely", () => {
  it("the table has no duplicate rows", () => {
    expect(duplicateEffectRows().join(", ")).toBe("")
  })

  it("every row is a fixture, and every fixture has a row", () => {
    const rows = new Set(EFFECT_COUNTS.map((row) => row.fixture))
    expect([...rows].filter((name) => !fixtures.includes(name))).toEqual([])
    expect(fixtures.filter((name) => !rows.has(name))).toEqual([])
  })

  /**
   * The floor that says the channel is measuring something. A table of 131 rows
   * all reading zero would satisfy every equality below and prove nothing, and
   * that is the exact shape the channel degrades into if `mock.module` stops
   * intercepting `signals.ts` — the tracer goes quiet and every count is 0.
   */
  it("the table is not all zeroes — the tracer is actually intercepting", () => {
    const live = EFFECT_COUNTS.filter((row) => row.created > 0)
    expect(live.length, "no fixture creates an effect — the tracer is not installed").toBeGreaterThanOrEqual(20)
    expect(EFFECT_COUNTS.reduce((n, row) => n + row.runs, 0)).toBeGreaterThan(live.length)
  })

  it("no row claims effects that never run", () => {
    for (const row of EFFECT_COUNTS) {
      if (row.created === 0) {
        expect(row.runs, `${row.fixture} runs effects it never created`).toBe(0)
        continue
      }
      expect(row.runs, `${row.fixture} created effects that never ran`).toBeGreaterThanOrEqual(
        row.created,
      )
      expect(row.busiest, `${row.fixture} busiest`).toBeGreaterThanOrEqual(1)
      expect(row.busiest, `${row.fixture} busiest exceeds its own total`).toBeLessThanOrEqual(row.runs)
    }
  })

  if (PRINT) {
    it("BARQ_EFFECTS=print — the table body, from this build", async () => {
      const rows: string[] = []
      for (const name of fixtures) rows.push(formatEffectRow(await measure(name)))
      console.log(`\n${rows.join("\n")}\n`)
    }, 300_000)
  }

  for (const name of fixtures) {
    it(`${name}`, async () => {
      const row = TABLE.get(name)
      const observed = await measure(name)
      expect(
        row,
        `${name} has no row in effect-counts.ts — add ${formatEffectRow(observed)}`,
      ).toBeDefined()
      // One assertion over the whole row, so a failure prints the literal that
      // replaces it rather than three separate numbers to reassemble by hand.
      expect(formatEffectRow(observed), "BARQ_EFFECTS=print regenerates the table").toBe(
        formatEffectRow(row!),
      )
    })
  }
})
