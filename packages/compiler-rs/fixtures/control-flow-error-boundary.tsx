import { ErrorBoundary, signal } from "@barqjs/core"

export const broken = signal(true)

function Fragile() {
  if (broken()) throw new Error("boom")
  return <p class="ok">recovered</p>
}

export default function ControlFlowErrorBoundary() {
  return (
    <div>
      <ErrorBoundary
        fallback={(error, reset) => (
          <button type="button" onClick={reset}>
            {error.message}
          </button>
        )}
      >
        {() => <Fragile />}
      </ErrorBoundary>
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
