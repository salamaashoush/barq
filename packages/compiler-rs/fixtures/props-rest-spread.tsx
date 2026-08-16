import { signal } from "@barqjs/core"

export const label = signal("first")

/**
 * A rest element collects everything the pattern did not name, and the rest
 * object is then spread onto an intrinsic element. A rest pattern reads EVERY
 * remaining prop eagerly — it has to, to build the object — so this is the one
 * props shape where fine-grained flow across the boundary cannot survive at
 * all, and the two paths have to agree about that.
 */
function Chip(props: { text: () => string; id: string; "data-tone": string }) {
  const { text, ...rest } = props
  return (
    <span class="chip" {...rest}>
      {text}
    </span>
  )
}

export default function PropsRestSpread() {
  return (
    <div class="chips">
      <Chip text={() => label()} id="chip-1" data-tone="warm" />
    </div>
  )
}

export const steps = [() => label.set("second")]

export const optimality = {
  target: 1,
  milestone: 9,
  // Two templates: the outer div, and `Chip`'s own span. The spread does not
  // take the span off the template path — it takes its ATTRIBUTES off it, and
  // `class="chip"` is applied in source order beside the spread rather than
  // baked, because a key inside `rest` may name it.
  templates: 2,
  emits: ["Chip(", "spread(", "rest"],
  absent: ["get text()", "(Chip, {", "createElement"],
}
