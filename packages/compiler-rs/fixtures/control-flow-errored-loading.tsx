import { Errored, Loading, Reveal, signal } from "@barqjs/core"

export const failing = signal(true)

function Flaky() {
  if (failing()) throw new Error("nope")
  return <p class="fine">fine</p>
}

export default function ControlFlowErroredLoading() {
  return (
    <Reveal order="together">
      <Loading fallback={<span class="busy">busy</span>}>
        <Errored
          fallback={(error, reset) => (
            <button type="button" onClick={reset}>
              {error().message}
            </button>
          )}
        >
          {() => <Flaky />}
        </Errored>
      </Loading>
    </Reveal>
  )
}

export const events = [
  (root: HTMLElement) => {
    failing.set(false)
    root.querySelector("button")?.click()
  },
]
