import { createSignal } from "@barqjs/core"

export const [label, setLabel] = createSignal("first")

function Chip(props: { label: () => string; tone: string; id: string }) {
  return (
    <span class="chip" data-tone={props.tone} id={props.id}>
      {() => props.label}
    </span>
  )
}

export default function ComponentSpread() {
  // C3 law 1 is TOTAL, so a spread source has to reach the consumer as Cells
  // like every other prop. The object is written as values, as an attribute
  // beside it is, and the compiler carries each one as a Cell.
  const shared = { tone: "warm", id: "chip-1" }
  return (
    <div>
      <Chip label={() => label()} {...shared} />
      <Chip {...shared} id="chip-2" label={() => "static"} />
    </div>
  )
}

export const steps = [() => setLabel("second")]

export const optimality = {
  target: 4,
  templates: 2,
  // Target #4 across a component boundary: `data-tone` and `id` are two live
  // reads on ONE element, so they share ONE renderEffect with per-key `!==`
  // guards. A spread onto a COMPONENT is one more source in the props list,
  // carried as it stands: no DOM spread helper, no runtime prop resolution.
  emits: ["Chip(", "{ label }, ", "carry(shared)", "bindEffect(", '"data-tone"', '"id"'],
  absent: ["(Chip, {", "spread("],
}
