import { signal } from "@barqjs/core"

export const label = signal("first")

/**
 * The same flattening, one statement later: destructured in the BODY rather
 * than in the parameter list. The parameter is still a `PropsParam`, so every
 * member read on it is ⊤-reactive right up to the point the pattern copies it
 * out — and after that it is a plain local.
 */
function Chip(props: { text: () => string; tone: string }) {
  const { text, tone } = props
  return (
    <span class="chip" data-tone={tone}>
      {text}
    </span>
  )
}

export default function PropsDestructuredBody() {
  return (
    <div class="chips">
      <Chip text={() => label()} tone="warm" />
    </div>
  )
}

export const steps = [() => label.set("second")]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 2,
  // Destructuring in the BODY is the same read at a different line: `const {
  // text, tone } = props` drains the object once. The claim is that the call
  // site still hands over a real props object and not a copy of one.
  emits: ["Chip(", '() => "warm"', "text: label"],
  absent: ["get text()", "get tone()", "(Chip, {"],
}
