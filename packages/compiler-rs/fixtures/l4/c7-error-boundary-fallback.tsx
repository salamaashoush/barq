/**
 * C7 on the boundary's OTHER Block — the fallback.
 *
 * `c7-error-boundary` instruments the content arm. This one instruments the
 * recovered arm, and it exists because a mutant that builds the fallback twice
 * passed single-evaluation 25/25 while the corpus banner still read `0
 * BLOCK_EVALUATED_TWICE`: `errorBoundary` invoked both of its arms directly
 * instead of through the counted call, so the one recorded bug the old
 * `ErrorBoundary` shipped — building its fallback twice on a construction throw,
 * once inline in the `catch` and once when the effect re-ran on the captured
 * error — was outside every L4 channel.
 *
 * C7 and E3.
 */
import { Errored, signal } from "@barqjs/core"

export const log: string[] = []

export const broken = signal(true)

function Fragile() {
  if (broken()) throw new Error("boom")
  return <p class="ok">recovered</p>
}

export default function C7ErrorBoundaryFallback() {
  return (
    <div class="host">
      <Errored
        fallback={(error, reset) => {
          log.push("fallback")
          return (
            <button type="button" onClick={reset}>
              {() => error().message}
            </button>
          )
        }}
      >
        {() => <Fragile />}
      </Errored>
    </div>
  )
}

export const events = [
  (root: HTMLElement) => {
    broken.set(false)
    root.querySelector("button")?.click()
  },
]

export const c7 = {
  why: "the fallback arm is one activation, so its Block is built once — not once in the catch and once again when the boundary's key settles on the failed arm",
  log: ["fallback"],
}
