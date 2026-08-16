/**
 * js-reactivity-benchmark, in a real Chrome.
 *
 * The suite is `milomg/js-reactivity-benchmark` (ISC), vendored under
 * `../vendor/jrb` with its `kairo`, `cellx`, `sBench` and `dependencyGraph`
 * benches unmodified. This file is only the two adapters and the entry point:
 * everything that decides what is measured is theirs.
 *
 * ## Why it is Tier 2 and the eleven cases are not
 *
 * `CODESIGN.md` §0.1's "10 wins / 1 tie, up to 6.25x" is eleven graphs this
 * project wrote, timed in Node. This is a suite this project did not write,
 * with graphs chosen by somebody with no stake in the answer, run in the engine
 * a browser actually uses. Both numbers can be true; only one of them is
 * evidence about a framework rather than about eleven cases.
 *
 * ## The one adapter decision, stated
 *
 * `withBatch` ends with a flush on BOTH sides. barq's effects run on a
 * microtask and `@solidjs/signals` 2.0 has no `batch` at all — writes are
 * batched by default and `flush()` is what commits them — so "the writes are
 * visible and the effects have run" is `fn(); flush()` in both. Several kairo
 * cases count effect runs (`deepPropagation` asserts `callCounter.count ===
 * 50`), so an adapter that did not flush would not be measuring the same
 * program, it would be failing the benchmark's own assertions.
 */
import { computed as bComputed, effect as bEffect, flush as bFlush, signal as bSignal, createScope as bScope } from "@barqjs/core"
import {
  createEffect as sEffect,
  createMemo as sMemo,
  createRoot as sRoot,
  createSignal as sSignal,
  flush as sFlush,
} from "@solidjs/signals"

import { cellxbench } from "../vendor/jrb/benches/cellxBench.ts"
import { kairoBench } from "../vendor/jrb/benches/kairoBench.ts"
import { sbench } from "../vendor/jrb/benches/sBench.ts"
import type { FrameworkInfo } from "../vendor/jrb/util/frameworkTypes.ts"
import type { PerfResult } from "../vendor/jrb/util/perfLogging.ts"
import type { ReactiveFramework } from "../vendor/jrb/util/reactiveFramework.ts"

const barqFramework: ReactiveFramework = {
  name: "barq",
  signal: (initialValue) => {
    const s = bSignal(initialValue)
    return { read: () => s(), write: (v) => s.set(v) }
  },
  computed: (fn) => {
    const m = bComputed(fn)
    return { read: () => m() }
  },
  effect: (fn) => {
    bEffect(fn)
  },
  withBatch: (fn) => {
    fn()
    bFlush()
  },
  withBuild: (fn) =>
    bScope((dispose) => {
      barqFramework.cleanup = dispose
      const value = fn()
      bFlush()
      return value
    }, true),
  cleanup: () => {},
}

const solidFramework: ReactiveFramework = {
  name: "@solidjs/signals",
  signal: (initialValue) => {
    const [get, set] = sSignal(initialValue)
    return { read: () => get(), write: (v) => set(v as never) }
  },
  computed: (fn) => {
    const m = sMemo(fn)
    return { read: () => m() }
  },
  effect: (fn) => {
    sEffect(fn, () => {})
  },
  withBatch: (fn) => {
    fn()
    sFlush()
  },
  withBuild: (fn) =>
    sRoot((dispose) => {
      solidFramework.cleanup = dispose
      const value = fn()
      sFlush()
      return value
    }),
  cleanup: () => {},
}

const FRAMEWORKS: FrameworkInfo[] = [
  { framework: barqFramework, testPullCounts: true },
  { framework: solidFramework, testPullCounts: true },
]

const globalScope = globalThis as Record<string, unknown>

/**
 * `console.assert` is the benchmarks' own correctness check and a browser
 * console nobody reads is where it goes. Intercepted so that a failed assertion
 * comes back to the driver and fails the run: a reactivity benchmark whose
 * graph produced the wrong number is not a slow framework, it is no
 * measurement at all.
 */
const violations: string[] = []
const nativeAssert = console.assert.bind(console)
console.assert = (condition: unknown, ...rest: unknown[]) => {
  if (!condition) violations.push(rest.map(String).join(" ") || "assertion failed")
  nativeAssert(condition, ...rest)
}

globalScope.__jrbSuites = ["kairo", "cellx", "sbench"]

/**
 * A DEPTH SWEEP, and it is not part of the vendored suite.
 *
 * `cellx` reports barq 48x behind at 1,000 layers and 177x at 2,500, which is
 * a ratio nobody should act on without knowing what it is a ratio OF. This is
 * the diagnosis: the same stacked-diamond shape cellx builds, at five depths,
 * reported as milliseconds PER LAYER. A framework whose propagation is linear
 * in depth holds that number flat. One whose per-layer cost rises is quadratic
 * in depth overall, and the cellx ratio is then a statement about 1,000 layers
 * and about nothing else.
 *
 * It is here rather than in a scratch file because a finding that only exists
 * as a number in a report is a finding nobody can re-run.
 */
globalScope.__jrbDepth = (layers: number, iterations: number) => {
  try {
    const run = (framework: ReactiveFramework): number => {
      let elapsed = 0
      framework.withBuild(() => {
        const sources = [
          framework.signal(1),
          framework.signal(2),
          framework.signal(3),
          framework.signal(4),
        ]
        let layer: Array<{ read(): number }> = sources
        for (let i = layers; i > 0; i--) {
          const m = layer
          const s = [
            framework.computed(() => m[1].read()),
            framework.computed(() => m[0].read() - m[2].read()),
            framework.computed(() => m[1].read() + m[3].read()),
            framework.computed(() => m[2].read()),
          ]
          for (const c of s) framework.effect(() => c.read())
          layer = s
        }
        const start = performance.now()
        for (let k = 0; k < iterations; k++) {
          framework.withBatch(() => {
            sources[0].write(4 + k)
            sources[1].write(3 + k)
            sources[2].write(2 + k)
            sources[3].write(1 + k)
          })
          layer[0].read()
        }
        elapsed = performance.now() - start
      })
      framework.cleanup()
      return elapsed
    }
    return {
      layers,
      iterations,
      barq: run(barqFramework),
      solid: run(solidFramework),
    }
  } catch (error) {
    return { __benchError: `depth ${layers}: ${(error as Error)?.message ?? error}` }
  }
}

globalScope.__jrb = async (suite: string) => {
  try {
    violations.length = 0
    const results: PerfResult[] = []
    const log = (result: PerfResult) => results.push(result)
    if (suite === "kairo") await kairoBench(FRAMEWORKS, log)
    else if (suite === "cellx") await cellxbench(FRAMEWORKS, log)
    else if (suite === "sbench") {
      for (const { framework } of FRAMEWORKS) await sbench(framework, log)
    } else throw new Error(`no suite named ${suite}`)
    if (violations.length > 0) {
      throw new Error(`the benchmark's own assertions failed: ${violations.slice(0, 3).join(" | ")}`)
    }
    return { results }
  } catch (error) {
    return { __benchError: `${suite}: ${(error as Error)?.message ?? error}` }
  }
}

globalScope.__ready = true
