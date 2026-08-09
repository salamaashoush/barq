import { Index, signal } from "@barqjs/core"

export const nums = signal([1, 2, 3])

export default function ControlFlowIndex() {
  return (
    <ol>
      <Index each={() => nums()}>{(item, index) => <li>{index}={() => item()}</li>}</Index>
    </ol>
  )
}

export const steps = [() => nums.set([9, 2, 3]), () => nums.set([9]), () => nums.set([1, 2, 3, 4])]
