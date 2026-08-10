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

export const optimality = {
  target: 8,
  milestone: 5,
  templates: 3,
  // Three nested flow components, each an ordinary call whose `children` is
  // whatever the next one returned — no `createElement` anywhere, so nothing
  // copies a props object on the way down. `Errored.fallback` takes an error
  // ACCESSOR, so the read inside it is a call.
  emits: ["Reveal(", "Loading(", "Errored(", ", error, reset) =>"],
  absent: ["(Reveal, {", "(Loading, {", "(Errored, {"],
}
