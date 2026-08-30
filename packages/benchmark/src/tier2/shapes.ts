/**
 * Tier 2, half two: the props and calling-convention microbenchmarks, in
 * Chrome.
 *
 * These are the numbers that decided the props model and defended the calling
 * convention. Every one of them was taken on a stub DOM or on happy-dom, and
 * and a 0% happy-dom result is not sufficient evidence on its own. This is the
 * run that was asked for.
 *
 * Trials are interleaved across shapes and summarised with a spread and a
 * paired Wilcoxon on the comparisons the document actually makes, because the
 * claims at stake are single-digit percentages and a min-of-N in a fixed order
 * cannot resolve one.
 */
import { readFileSync } from "node:fs"

import { summarize, wilcoxon, type Summary } from "../stats.ts"
import { plainPage } from "./build.ts"
import { load, serve, withBenchChrome, type Page } from "./driver.ts"

export interface ShapeTiming {
  js: number
  total: number
}

export interface ShapeSide {
  js: Summary
  total: Summary
}

export interface Contrast {
  /** `a ÷ b` on the median. */
  label: string
  a: string
  b: string
  jsRatio: number
  totalRatio: number
  jsP: number
  totalP: number
  /**
   * Minimum detectable effect: the smallest ratio this contrast could have
   * resolved, as a fraction of `b`'s median, at roughly 80% power and α=0.05 on
   * the paired differences. A ratio inside `1 ± mde` is NOT evidence of no
   * effect — it is the instrument saying it cannot see one, which is a different
   * statement and the one "never significant" was quietly making.
   */
  jsMde: number
  totalMde: number
}

export interface ShapeResult {
  rows: number
  trials: number
  shapes: Record<string, ShapeSide>
  contrasts: Contrast[]
  /**
   * The raw per-trial timings, kept because a summary nobody can re-analyse is
   * a summary nobody can check: the power of the `total` column, the shape of
   * its tail and any re-reading of a contrast all need these and nothing else
   * in the artifact carries them.
   */
  samples: Record<string, ShapeTiming[]>
}

/**
 * The same shapes with the DOM replaced by a plain object: the original
 * instrument, run by V8 instead of by Bun over happy-dom.
 *
 * It exists because the browser arms cannot decide the ratio. Their `js` column
 * is ~2% of the number they report — 2000 ns a row against the 46.6 ns a row
 * the stub reported — so a 23.7% difference in the JS half would be ~0.5% of
 * that column and no number of trials resolves it. The browser arms bound the
 * TOTAL cost; this one measures the quantity 23.7% was a percentage OF.
 */
export interface StubResult {
  rows: number
  trials: number
  /** Milliseconds per mount, per shape. */
  shapes: Record<string, Summary>
  /** Nanoseconds per row, per shape — the shapes reading's own unit. */
  nsPerRow: Record<string, number>
  ratios: Array<{ label: string; a: string; b: string; ratio: number; p: number; mde: number }>
}

/** One keying mode's answer to the two updates that tell the three apart. */
export interface KeyingArm {
  builtOnReplace: number
  builtOnReorder: number
  replaceMs: number
  reorderMs: number
}

export interface KeyingResult {
  rows: number
  arms: Record<string, KeyingArm>
}

export interface ChannelResult {
  writes: number
  /** Nanoseconds per write. */
  nsPerWrite: Record<string, number>
}

export interface ShapesResult {
  /** One entry per row count, so a scale-dependent conclusion cannot hide. */
  shapes: ShapeResult[]
  channels: ChannelResult
  /** K1's cost, which the rule states in words. */
  keying: KeyingResult[]
  /** The stub-DOM contrast, in V8 — the only arm that can rule on 23.7%. */
  stub: StubResult[]
}

/**
 * The comparisons the design record actually makes. Naming them here rather than
 * printing a 9x9 grid is the point: each one is a recorded sentence that
 * this lane is re-adjudicating.
 */
const CONTRASTS: Array<{ label: string; a: string; b: string }> = [
  { label: "§0.3.4 the chosen convention against what shipped", a: "D", b: "A" },
  { label: "§0.3.1 return-DOM against append-to-anchor", a: "B", b: "C" },
  { label: "§0.3.1 append-to-anchor against scope-passing", a: "C", b: "D" },
  { label: "§0.3.2 a Scope per position (the NO_SCOPE flag)", a: "D2", b: "D" },
  { label: "§0.3.3 component inlining (Anvil's headline optimisation)", a: "E", b: "C" },
  { label: "§0.2 getter props against value props", a: "GETTER", b: "VALUE" },
  { label: "§0.2 thunk props against value props", a: "THUNK", b: "VALUE" },
]

/**
 * The smallest paired difference this many trials could have resolved, as a
 * fraction of the comparand's median. `2.8 = z(0.975) + z(0.80)`, the textbook
 * two-sided 80%-power constant, over the standard error of the differences.
 *
 * It exists because "never significant" is not a finding on its own: a column
 * whose MDE is 3% cannot rule on a 0.2% effect, and reporting only the p-value
 * turns "the instrument is blind here" into "there is nothing here".
 *
 * The spread is the ROBUST one — `IQR / 1.349`, the normal-consistent estimator
 * — for the same reason every other number here is a median and a p25–p75: a
 * mount-time distribution has a long right tail (one GC, one layout the browser
 * decided to do anyway), and a sample SD over it reports an instrument far
 * blinder than the rank test it sits beside actually is.
 */
function mde(differences: number[], baselineMedian: number): number {
  const n = differences.length
  if (n < 2 || baselineMedian === 0) return Number.POSITIVE_INFINITY
  const spread = summarize(differences)
  const sigma = (spread.p75 - spread.p25) / 1.349
  return (2.8 * (sigma / Math.sqrt(n))) / baselineMedian
}

function contrast(
  label: string,
  a: string,
  b: string,
  samples: Record<string, ShapeTiming[]>,
): Contrast {
  const as = samples[a]
  const bs = samples[b]
  const median = (xs: number[]) => summarize(xs).median
  const aJs = as.map((t) => t.js)
  const bJs = bs.map((t) => t.js)
  const aTotal = as.map((t) => t.total)
  const bTotal = bs.map((t) => t.total)
  const jsDiff = aJs.map((v, i) => v - bJs[i])
  const totalDiff = aTotal.map((v, i) => v - bTotal[i])
  return {
    label,
    a,
    b,
    jsRatio: median(aJs) / median(bJs),
    totalRatio: median(aTotal) / median(bTotal),
    jsP: wilcoxon(jsDiff).p,
    totalP: wilcoxon(totalDiff).p,
    jsMde: mde(jsDiff, median(bJs)),
    totalMde: mde(totalDiff, median(bTotal)),
  }
}

/**
 * The contrast without the DOM. `STUB_CONTRASTS` is the subset the four
 * conclusions are stated over; B is absent because a stub node has no "return
 * it and let the caller append" that differs from appending.
 */
const STUB_CONTRASTS: Array<{ label: string; a: string; b: string }> = [
  { label: "§0.3.4 the chosen convention against what shipped", a: "D", b: "A" },
  { label: "§0.3.1 append-to-anchor against scope-passing", a: "C", b: "D" },
  { label: "§0.3.2 a Scope per position (the NO_SCOPE flag)", a: "D2", b: "D" },
  { label: "§0.3.3 component inlining (Anvil's headline optimisation)", a: "E", b: "C" },
  { label: "§0.2 getter props against value props", a: "GETTER", b: "VALUE" },
  { label: "§0.2 thunk props against value props", a: "THUNK", b: "VALUE" },
]

async function runStub(chrome: Page, rows: number, trials: number): Promise<StubResult> {
  await chrome.call<{ ok: string[] }>("window.__stubPrepare()")
  const samples: Record<string, number[]> = {}
  for (let trial = 0; trial < trials; trial++) {
    const one = await chrome.call<{ timings: Record<string, number> }>(
      `window.__stubTrial(${trial})`,
    )
    for (const [name, ms] of Object.entries(one.timings)) (samples[name] ??= []).push(ms)
  }
  const sides: Record<string, Summary> = {}
  const nsPerRow: Record<string, number> = {}
  for (const [name, list] of Object.entries(samples)) {
    sides[name] = summarize(list)
    nsPerRow[name] = (sides[name].median * 1e6) / rows
  }
  const ratios = STUB_CONTRASTS.filter((c) => samples[c.a] && samples[c.b]).map((c) => {
    const diff = samples[c.a].map((v, i) => v - samples[c.b][i])
    return {
      label: c.label,
      a: c.a,
      b: c.b,
      ratio: sides[c.a].median / sides[c.b].median,
      p: wilcoxon(diff).p,
      mde: mde(diff, sides[c.b].median),
    }
  })

  console.log(`  ${rows} rows, STUB DOM in V8 — §0.3's own instrument, nanoseconds per row:`)
  for (const [name, ns] of Object.entries(nsPerRow)) {
    console.log(`    ${name.padEnd(7)} ${ns.toFixed(2)} ns/row`)
  }
  for (const r of ratios) {
    console.log(
      `    ${r.a}/${r.b}  ${r.ratio.toFixed(3)}x (p=${r.p.toExponential(1)}, ` +
        `mde ${(r.mde * 100).toFixed(2)}%)   ${r.label}`,
    )
  }
  return { rows, trials, shapes: sides, nsPerRow, ratios }
}

export async function runShapes(
  rowCounts: readonly number[] = [200, 1000],
  trials = 41,
): Promise<ShapesResult> {
  const page = await plainPage(
    readFileSync(new URL("./apps/shapes.ts", import.meta.url), "utf8"),
    "shapes",
  )
  const server = serve(page.files)
  try {
    return await withBenchChrome(async (chrome) => {
      await load(chrome, server.url(page.page))
      const shapes: ShapeResult[] = []
      const stub: StubResult[] = []
      for (const rows of rowCounts) {
        const names = await chrome.call<{ ok: string[] }>(`window.__shapesPrepare(${rows})`)
        const samples: Record<string, ShapeTiming[]> = {}
        for (const name of names.ok) samples[name] = []
        for (let trial = 0; trial < trials; trial++) {
          const one = await chrome.call<{ timings: Record<string, ShapeTiming> }>(
            `window.__shapesTrial(${trial})`,
          )
          for (const [name, timing] of Object.entries(one.timings)) samples[name].push(timing)
        }
        const sides: Record<string, ShapeSide> = {}
        for (const [name, list] of Object.entries(samples)) {
          sides[name] = {
            js: summarize(list.map((t) => t.js)),
            total: summarize(list.map((t) => t.total)),
          }
        }
        const contrasts = CONTRASTS.map((c) => contrast(c.label, c.a, c.b, samples))
        shapes.push({ rows, trials, shapes: sides, contrasts, samples })
        stub.push(await runStub(chrome, rows, trials))

        console.log(`  ${rows} rows, ${trials} interleaved trials, milliseconds per mount:`)
        for (const [name, side] of Object.entries(sides)) {
          console.log(
            `    ${name.padEnd(7)} js ${side.js.median.toFixed(3)} ` +
              `[${side.js.p25.toFixed(3)}–${side.js.p75.toFixed(3)}]   ` +
              `total ${side.total.median.toFixed(3)} ` +
              `[${side.total.p25.toFixed(3)}–${side.total.p75.toFixed(3)}]`,
          )
        }
        for (const c of contrasts) {
          console.log(
            `    ${c.a}/${c.b}  js ${c.jsRatio.toFixed(3)}x (p=${c.jsP.toExponential(1)}, ` +
              `mde ${(c.jsMde * 100).toFixed(2)}%)  ` +
              `total ${c.totalRatio.toFixed(3)}x (p=${c.totalP.toExponential(1)}, ` +
              `mde ${(c.totalMde * 100).toFixed(2)}%)   ${c.label}`,
          )
        }
      }

      const writes = 20_000
      const names = await chrome.call<string[]>(`window.__channelNames(${writes})`)
      const nsPerWrite: Record<string, number> = {}
      console.log(`  channels, ns per write (${writes} writes, min of ${trials}):`)
      for (const name of names) {
        const one = await chrome.call<{ nsPerWrite: number }>(
          `window.__channel(${JSON.stringify(name)}, ${writes}, ${trials})`,
        )
        nsPerWrite[name] = one.nsPerWrite
        console.log(`    ${name.padEnd(22)} ${one.nsPerWrite.toFixed(2)} ns`)
      }
      // The three comparisons this is actually about, each against a comparand
      // that does the SAME work. The bare-DOM rows stay above so the extra work
      // is visible rather than folded away.
      const pair = (dispatched: string, direct: string): string =>
        `${(nsPerWrite[dispatched] / nsPerWrite[direct]).toFixed(3)}x`
      console.log(
        "  the dispatcher, on equivalent work:\n" +
          `    id     setProp / setAttribute        ${pair("setProp id", "setAttribute id")}\n` +
          `    value  setProp / value= +caret       ${pair("setProp value", "input.value = +caret")}\n` +
          `           setProp / bare value=         ${pair("setProp value", "input.value =")}  (setProp also preserves the caret)\n` +
          `    class  setProp / className= +own     ${pair("setProp class", "className= +own")}\n` +
          `           setProp / bare className=     ${pair("setProp class", "el.className =")}  (setProp also checks it still owns the attribute)\n` +
          `           setProp / classList diff      ${pair("setProp class", "classList diff")}  (the path setProp falls to when it does NOT)\n` +
          `           setProp / bare className=     ${pair("setProp class fresh", "el.className = fresh")}  on a FRESH token every write — the case F3's fix made runnable`,
      )

      const keying: KeyingResult[] = []
      for (const rows of rowCounts) {
        const one = await chrome.call<KeyingResult>(`window.__keying(${rows}, 9)`)
        keying.push(one)
        console.log(`  K1, ${one.rows} rows, rows REBUILT and milliseconds per update:`)
        for (const [mode, arm] of Object.entries(one.arms)) {
          console.log(
            `    ${mode.padEnd(8)} immutable replacement ${String(arm.builtOnReplace).padStart(5)} ` +
              `(${arm.replaceMs.toFixed(3)} ms)   reorder ${String(arm.builtOnReorder).padStart(5)} ` +
              `(${arm.reorderMs.toFixed(3)} ms)`,
          )
        }
      }
      return { shapes, channels: { writes, nsPerWrite }, keying, stub }
    })
  } finally {
    server.stop()
  }
}
