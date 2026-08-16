/**
 * C7 and E3 on `boundary`, error kind.
 *
 * A boundary is a `branch` keyed on `{content | fallback}` plus a `try`, so the
 * content Block is invoked once per activation exactly like any other body — and
 * a construction throw that selects the fallback arm is a SECOND activation, not
 * a second invocation of the first.
 *
 * The old `ErrorBoundary` built its fallback twice on a construction throw: once
 * inline in the `catch` and once when the effect re-ran on the captured error.
 */
import { Errored, signal } from "@barqjs/core"

export const log: string[] = []

export const broken = signal(true)

function Fragile() {
  if (broken()) throw new Error("boom")
  return <p class="ok">recovered</p>
}

export default function C7ErrorBoundary() {
  return (
    <div class="host">
      <Errored
        fallback={(error, reset) => (
          <button type="button" onClick={reset}>
            {() => error().message}
          </button>
        )}
      >
        {() => {
          log.push("content")
          return <Fragile />
        }}
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
  why: "one invocation for the throwing activation, one for the retry after reset()",
  log: ["content", "content"],
}
