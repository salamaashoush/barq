import { createSignal } from "@barqjs/core"

export const [label, setLabel] = createSignal("first")

/**
 * Props destructured in the PARAMETER LIST. The pattern becomes one props
 * record and each name the read it stood for, so both names stay live across
 * the boundary where a JavaScript destructure would have copied them once.
 * That is the contract this shape pins.
 */
function Chip({ text, tone }: { text: string; tone: string }) {
  return (
    <span class="chip" data-tone={tone}>
      {text}
    </span>
  )
}

export default function PropsDestructuredParam() {
  return (
    <div class="chips">
      <Chip text={label()} tone="warm" />
      <Chip text="static" tone="cool" />
    </div>
  )
}

export const steps = [() => setLabel("second")]

export const optimality = {
  target: 1,
  templates: 2,
  // A destructured PARAMETER is not a snapshot: the two names are reads of the
  // one props record. The call site is what it is for a `props` parameter: a
  // real props object, with the accessor the value was read from passed as its Cell.
  emits: ["createComponent(Chip, ", '() => "warm"', "text: label"],
  absent: ["get text()", "get tone()", "(Chip, {"],
}
