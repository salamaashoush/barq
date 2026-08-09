import { signal } from "@barqjs/core"

export const label = signal("first")

function Chip(props: { label: () => string; tone: string; id: string }) {
  return (
    <span class="chip" data-tone={props.tone} id={props.id}>
      {() => props.label()}
    </span>
  )
}

export default function ComponentSpread() {
  const shared = { tone: "warm", id: "chip-1" }
  return (
    <div>
      <Chip label={() => label()} {...shared} />
      <Chip {...shared} id="chip-2" label={() => "static"} />
    </div>
  )
}

export const steps = [() => label.set("second")]

// One coalesced effect per `Chip` for `data-tone` + `id`, both read off the
// props object the compiled call site handed over. The oracle reads them once
// out of `{ ...props }` and can never see a later write.
export const goesLive = ["Chip 1 tone/id", "Chip 2 tone/id"]

export const optimality = {
  target: 4,
  milestone: 5,
  templates: 2,
  // Target #4 across a component boundary: `data-tone` and `id` are two live
  // reads on ONE element, so they share ONE renderEffect with per-key `!==`
  // guards. A spread onto a COMPONENT is an ordinary object spread — no
  // spread helper call, no runtime prop resolution.
  emits: ["Chip({", "...shared", "renderEffect(", '"data-tone"', '"id"'],
  absent: ["(Chip, {", "spread("],
}
