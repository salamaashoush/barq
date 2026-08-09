import { signal } from "@barqjs/core"

export const label = signal("first")

/**
 * Props destructured in the PARAMETER LIST. The compiler lowers reactive props
 * to getters, and a parameter pattern flattens every one of them exactly once —
 * so the only thing that can stay live across the boundary is a prop whose
 * VALUE is an accessor. That is the contract this shape pins, and it is the
 * commonest way real code loses reactivity by accident.
 */
function Chip({ text, tone }: { text: () => string; tone: string }) {
  return (
    <span class="chip" data-tone={tone}>
      {text}
    </span>
  )
}

export default function PropsDestructuredParam() {
  return (
    <div class="chips">
      <Chip text={() => label()} tone="warm" />
      <Chip text={() => "static"} tone="cool" />
    </div>
  )
}

export const steps = [() => label.set("second")]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 2,
  // A destructured PARAMETER reads every prop at binding time, so the two
  // locals are snapshots and nothing the compiler does can make them live.
  // What it can do is not pretend otherwise: the props object is built with
  // plain values, and the author-written accessor passes through as one.
  emits: ["Chip({", 'tone: "warm"', "text: () => label()"],
  absent: ["get text()", "get tone()", "(Chip, {"],
}
