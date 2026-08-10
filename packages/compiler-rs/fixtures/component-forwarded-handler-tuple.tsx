import { signal } from "@barqjs/core"

export const picked = signal("none")

function pick(label: unknown, _event: MouseEvent): void {
  picked.set(String(label))
}

/**
 * The two prop shapes whose IDENTITY is observable, which is what C3.4 and C5
 * cost if a prop is anything but a Cell forwarded by name.
 *
 * Both reachable forms are here:
 *
 *  - `cb={[props.handler(), props.label()]}` — an array, so `identity_matters`
 *    evaluates it ONCE into a cell. The runtime installs that array as
 *    the `$$click` expando, so a carrier that rebuilt it per read would install
 *    a different listener on every frame.
 *  - `render={() => …}` — an author-written zero-arity arrow, which §3.0 rule 1
 *    says already IS a Cell, so it forwards untouched and reads the same object
 *    twice.
 *
 * `data-same` and `data-render-same` are that identity, rendered: each reads its
 * prop twice and says whether the two reads agreed. Both must say `true` on the
 * FIRST frame, where nothing can declare its way out.
 *
 * This fixture was written against the getter model, where the refusal being
 * measured was "do not wrap a function-shaped reactive prop in a getter". M3
 * deleted getters outright (C3), so the refusal is gone and what survives is
 * the property it existed to protect — which is the half worth pinning.
 */
function Chip(props: {
  cb: [(label: unknown, event: MouseEvent) => void, string]
  render: () => string
  tone: string
}) {
  return (
    <button
      type="button"
      class="chip"
      data-tone={props.tone()}
      data-same={String(props.cb === props.cb)}
      data-render-same={String(props.render === props.render)}
      onClick={props.cb()}
    >
      {props.render()}
    </button>
  )
}

function Row(props: {
  on: boolean
  handler: (label: unknown, event: MouseEvent) => void
  label: string
  long: () => string
  short: () => string
}) {
  return (
    <Chip
      cb={[props.handler(), props.label()]}
      render={() => (props.on() ? props.long() : props.short())}
      tone={props.label}
    />
  )
}

export default function ComponentForwardedHandlerTuple() {
  return (
    <div class="wrap">
      <b class="picked">{() => picked()}</b>
      <Row on={true} handler={pick} label="alpha" long={() => "long"} short={() => "short"} />
    </div>
  )
}

export const events = [
  (root: HTMLElement): void => {
    root.querySelector("button")?.click()
  },
]

// `data-tone`, `data-same` and `data-render-same` are three props reads on one
// element, so they share ONE effect the oracle never creates at all — it read
// the copied props object once at construction.
export const goesLive = ["Chip data-tone/data-same/data-render-same"]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 2,
  // Three carriers, three rules, in one call. `cb` is an array, so C3's
  // identity rule evaluates it ONCE into a cell; `render` is a zero-arity arrow
  // the author wrote, so §3.0 rule 1 forwards it untouched; `tone` is a Cell
  // already, so C5 forwards it by NAME and no closure is allocated at all.
  emits: [
    "Chip(",
    "([props.handler(), props.label()])",
    "tone: props.label",
  ],
  absent: ["get cb()", "get render()", "get tone()", "(Chip, {"],
}
