import { signal } from "@barqjs/core"

export const label = signal("first")

function Chip(props: { label: () => string; tone: string; id: string }) {
  return (
    <span class="chip" data-tone={props.tone()} id={props.id()}>
      {() => props.label()}
    </span>
  )
}

export default function ComponentSpread() {
  // C3 law 1 is TOTAL, and a spread source is spliced into the source list
  // verbatim — so its own properties have to be Cells like every other prop.
  // A raw value here is a prop the consumer cannot read: `props.tone()` throws.
  const shared = { tone: () => "warm", id: () => "chip-1" }
  return (
    <div>
      <Chip label={() => label()} {...shared} />
      <Chip {...shared} id="chip-2" label={() => "static"} />
    </div>
  )
}

export const steps = [() => label.set("second")]

export const optimality = {
  target: 4,
  milestone: 5,
  templates: 2,
  // Target #4 across a component boundary: `data-tone` and `id` are two live
  // reads on ONE element, so they share ONE renderEffect with per-key `!==`
  // guards. A spread onto a COMPONENT is an ordinary object spread — no
  // spread helper call, no runtime prop resolution.
  emits: ["Chip(", "[{ label }, shared]", "bindEffect(", '"data-tone"', '"id"'],
  absent: ["(Chip, {", "spread("],
}
