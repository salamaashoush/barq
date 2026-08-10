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
  // Two of the three constructs cease to exist (K5): `Loading` and `Errored`
  // are the same `boundary` primitive under two kind strings, and the arms are
  // Blocks handed to it positionally. `Reveal` is NOT lowered — it creates a
  // PROVIDE scope, not a range, so it is not one of the four primitives — and
  // it stays the ordinary call it always was. `Errored`'s fallback takes an
  // error ACCESSOR, so the read inside it is still a call.
  emits: [
    "Reveal(",
    'boundary(',
    '"loading"',
    '"error"',
    ", error, reset) =>",
  ],
  // Both boundaries stand FREE of any template — the construct is the whole of
  // `Reveal`'s children, so there is no walk to take a pair from and the region
  // expands in place with `(null, null)`, which is `flow.ts`'s own `siteFor`
  // path. The adapter frames -O0 still pays are the two named props each
  // boundary took; `Reveal`'s own props object survives, because `Reveal` does.
  absent: ["Loading(", "Errored(", "fallback: "],
}
