import { signal } from "@barqjs/core"

export const tone = signal("warm")

/**
 * The second half of "fine-grained flow across a component boundary", and the
 * half a one-layer fixture cannot see: FORWARDING.
 *
 * `Outer` reads `props.tone` and hands it on to `Chip`, which reads it again and
 * writes it to an attribute. Every read here is RAW — no author-written
 * accessor at either layer — so the chain only survives if `props` is
 * `SourceKind::PropsParam` at BOTH layers and the forwarded prop is emitted as a
 * getter rather than as the value the read produced. Before P0 assigned the
 * kind, `<Chip tone={props.tone} />` emitted a plain value and the chain died at
 * the first layer with nothing in the corpus able to notice.
 *
 * `createElement` copies the props object it is handed, so the oracle freezes
 * `tone` at the outermost call and both cells stay `warm` forever.
 */
function Chip(props: { tone: string }) {
  return (
    <span class="chip" data-tone={props.tone}>
      {props.tone}
    </span>
  )
}

function Outer(props: { tone: string }) {
  return <Chip tone={props.tone} />
}

export default function PropsRawForward() {
  return (
    <div class="wrap">
      <Outer tone={tone()} />
    </div>
  )
}

export const steps = [() => tone.set("cool")]

export const goesLive = ["Chip data-tone", "Chip text"]

export const wins = [
  {
    kind: "step" as const,
    index: 0,
    compiled: '<div class="wrap"><span class="chip" data-tone="cool">cool</span></div>',
    why: "the getter survives both layers, so the read stays live where createElement's copied props object froze it at the outermost call",
  },
]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 2,
  // The forward itself: the middle layer must hand ON a getter, not the value
  // its own read produced.
  emits: ["Chip({ get tone()", "return props.tone;"],
  absent: ["(Chip, {"],
}
