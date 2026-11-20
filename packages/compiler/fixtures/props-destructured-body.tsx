import { createSignal } from "@barqjs/core"

export const [label, setLabel] = createSignal("first")

/**
 * Destructured in the BODY rather than in the parameter list. The pattern is
 * not a copy: each name it binds is the read it stands for, so `text` and
 * `tone` follow the props exactly as `props.text` and `props.tone` do.
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

export const steps = [() => setLabel("second")]

export const optimality = {
  target: 1,
  templates: 2,
  // Destructuring in the BODY is the same read at a different line: every use
  // of `text` and `tone` reads `props`, live. The claim is that the call site
  // still hands over a real props object and not a copy of one.
  emits: ["Chip(", '() => "warm"', "text: label"],
  absent: ["get text()", "get tone()", "(Chip, {"],
}
