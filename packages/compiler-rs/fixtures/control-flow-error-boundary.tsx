import { Errored, signal } from "@barqjs/core"

export const broken = signal(true)

function Fragile() {
  if (broken()) throw new Error("boom")
  return <p class="ok">recovered</p>
}

export default function ControlFlowErrorBoundary() {
  return (
    <div>
      <Errored
        fallback={(error, reset) => (
          <button type="button" onClick={reset}>
            {() => error().message}
          </button>
        )}
      >
        {() => <Fragile />}
      </Errored>
    </div>
  )
}

// The boundary only retries on reset, so clearing the signal and clicking is one event.
export const events = [
  (root: HTMLElement) => {
    broken.set(false)
    root.querySelector("button")?.click()
  },
]

export const optimality = {
  target: 8,
  milestone: 5,
  templates: 3,
  // K5: `Errored` ceases to exist and becomes `boundary`, whose kind is
  // the string `"error"` and whose insertion pair is the one the walk computed.
  // `fallback` is `(error, reset) => Child`, so it is a real two-parameter
  // callback and never a built node; `reset` reaches the button as a handler
  // value, not through a thunk.
  emits: ["boundary(", '"error"', ", error, reset) =>"],
  // The adapter frame -O0 still pays: a props object, and the two slots the
  // boundary now takes positionally.
  absent: ["Errored(", "ErrorBoundary(", "fallback: ", "children: "],
}
