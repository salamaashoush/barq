import { signal } from "@barqjs/core"

export const n = signal(0)

export default function HandlerClosure() {
  const step = 3
  return (
    <button type="button" onClick={() => n.update((v) => v + step)}>
      {() => n()}
    </button>
  )
}

export const steps = [() => n.set(6)]

export const events = [
  (root: HTMLElement) => root.querySelector("button")?.click(),
  (root: HTMLElement) => root.querySelector("button")?.click(),
]

export const optimality = {
  target: 7,
  milestone: 2,
  // `ordered` alone is satisfied by the un-compiled JSX, where the handler also
  // trails the function it is written inside. The expando write is the clause
  // that says the compiler did something.
  emits: ["$$click = () => n.update"],
  absent: ["addEventListener"],
  ordered: [["function HandlerClosure", "n.update"]] as Array<[string, string]>,
}
