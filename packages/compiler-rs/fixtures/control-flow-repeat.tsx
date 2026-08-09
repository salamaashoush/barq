import { Repeat, signal } from "@barqjs/core"

export const n = signal(2)

export default function ControlFlowRepeat() {
  return (
    <div>
      <Repeat count={() => n()}>{(i) => <span class="cell">{i}</span>}</Repeat>
    </div>
  )
}

export const steps = [() => n.set(4), () => n.set(1)]
