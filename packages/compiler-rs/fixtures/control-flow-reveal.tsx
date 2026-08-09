import { Reveal, signal } from "@barqjs/core"

export const label = signal("one")

/**
 * `Reveal` on its own. It is one of the eight flow components with real
 * boundary semantics — it coordinates the order its children become visible —
 * so it is never inlined and never collapsed, and the compiler has to treat it
 * as an ordinary component call whose children are a thunk.
 */
export default function ControlFlowReveal() {
  return (
    <div class="reveal-host">
      <Reveal order="sequential">
        <p class="first">{() => label()}</p>
        <p class="second">tail</p>
      </Reveal>
    </div>
  )
}

export const steps = [() => label.set("two")]
export const optimality = {
  target: 8,
  milestone: 5,
  templates: 3,
  // `Reveal` takes its children as nodes, so target #8 applies to both of them:
  // the one with a hole is built by an IIFE and the fully static one is a bare
  // clone. Neither is wrapped in a thunk the compiler would have had to
  // manufacture.
  emits: ["Reveal({", 'order: "sequential"', "children: ["],
  absent: ["(Reveal, {", "children: () =>"],
}
