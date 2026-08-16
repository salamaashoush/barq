import { signal } from "@barqjs/core"

export const n = signal(0)

function bump(step: unknown, _event: MouseEvent): void {
  n.set(n.peek() + Number(step))
  document.querySelector(".count")?.setAttribute("data-clicked", String(step))
}

/**
 * The refusal branch of `getter_shaped`, which nothing else in the corpus
 * reaches, plus the dead plugin's "does not transform function expressions"
 * case.
 *
 * A component prop that IS a function — a bound-handler tuple, an author-written
 * accessor, a plain `function () {}` expression — must cross the boundary as a
 * VALUE. Wrapping one in an accessor property rebuilds it on every property
 * read, so `props.cb === props.cb` becomes false and the array the runtime
 * installs as the `$$click` expando is a different array each time. `data-same`
 * is that comparison, rendered: it reads the prop twice and says whether the two
 * reads agreed.
 */
function Chip(props: {
  cb: [(step: unknown, event: MouseEvent) => void, number]
  legacy: () => string
}) {
  return (
    <button type="button" class="chip" data-same={String(props.cb === props.cb)} onClick={props.cb()}>
      {props.legacy()}
    </button>
  )
}

export default function ComponentFunctionProps() {
  return (
    <div class="wrap">
      <b class="count">{n()}</b>
      <Chip
        cb={[bump, 2]}
        legacy={function () {
          return "legacy"
        }}
      />
    </div>
  )
}

export const events = [
  (root: HTMLElement): void => {
    root.querySelector("button")?.click()
  },
]

// `{n()}` is a bare read the compiler thunks (O4), and `data-same` is a member
// read on the props object, which crosses the boundary as a getter.
export const goesLive = ["count", "Chip data-same"]

export const wins = [
  {
    kind: "event" as const,
    index: 0,
    compiled:
      '<div class="wrap"><b class="count" data-clicked="2">2</b>' +
      '<button class="chip" data-same="true" type="button">legacy</button></div>',
    why: "the delegated tuple fired and the compiled count is live, where createElement read `n()` once at construction",
  },
]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 2,
  // Both props are functions the component installs or calls itself, so both
  // stay values. A getter here would be a new object per read.
  absent: ["get cb()", "get legacy()"],
  emits: ["([bump, 2])"],
}
