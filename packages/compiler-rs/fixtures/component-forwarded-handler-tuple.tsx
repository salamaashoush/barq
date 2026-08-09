import { signal } from "@barqjs/core"

export const picked = signal("none")

function pick(label: unknown, _event: MouseEvent): void {
  picked.set(String(label))
}

/**
 * `getter_shaped`'s REFUSAL branch, which needs a prop that is both
 * `React::Reactive` and function-shaped — a combination no other fixture
 * produces, so wrapping a handler or an author-written accessor in a getter was
 * a mutation the whole corpus stayed green under.
 *
 * Both reachable forms are here:
 *
 *  - `cb={[props.handler, props.label]}` — two props reads make the array
 *    reactive, and a first element that could be callable makes it a
 *    `HandlerTuple`. The runtime installs that array as the `$$click` expando,
 *    so its IDENTITY is the thing being protected: a getter rebuilds it on
 *    every property read.
 *  - `render={props.on ? … : …}` — a reactive choice between two author-written
 *    zero-arg arrows, which is `Shape::Accessor`. A getter here hands the
 *    component a different function every time it looks at the prop.
 *
 * `data-same` and `data-render-same` are that identity, rendered: each reads its
 * prop twice and says whether the two reads agreed. Under `createElement` they
 * are plain object properties and both say `true`, so a compiler that turned
 * either into a getter diverges on the FIRST frame, where nothing can declare
 * its way out.
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
      data-tone={props.tone}
      data-same={String(props.cb === props.cb)}
      data-render-same={String(props.render === props.render)}
      onClick={props.cb}
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
      cb={[props.handler, props.label]}
      render={props.on ? () => props.long() : () => props.short()}
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
  // The two function-shaped props stay VALUES. `tone`, forwarded from the same
  // props object in the same call, is the control: it is an ordinary reactive
  // read with no function shape and it DOES become a getter, so the absences
  // below are a refusal and not an absence of getters.
  emits: ["Chip({", "get tone()", "return props.label", "cb: [props.handler, props.label]"],
  absent: ["get cb()", "get render()"],
}
