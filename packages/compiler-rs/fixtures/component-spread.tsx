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
