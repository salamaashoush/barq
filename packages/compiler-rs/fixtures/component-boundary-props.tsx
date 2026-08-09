import { signal } from "@barqjs/core"

export const name = signal("world")

function Greeting(props: { name: () => string; punctuation: string }) {
  return (
    <p class="greeting">
      Hello, {() => props.name()}
      {props.punctuation}
    </p>
  )
}

export default function ComponentBoundaryProps() {
  return (
    <section>
      <Greeting name={() => name()} punctuation="!" />
      <Greeting name={() => "static"} punctuation="?" />
    </section>
  )
}

export const steps = [() => name.set("barq")]

// Two `Greeting` instances, each reading `props.name` and `props.punctuation`
// through a `PropsParam` binding. `createElement` copies the props object, so
// the oracle reads both once; the compiled call site passes getters and the
// reads stay live across the boundary.
export const goesLive = ["Greeting 1 props", "Greeting 2 props"]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 2,
  // Both props are read through a `PropsParam` binding, so both become live
  // reads inside the callee — including `punctuation`, which the caller passed
  // as a literal. The compiler cannot know the caller, and a component that is
  // reactive only for some of its callers is not reactive.
  emits: ["Greeting({", "() => props.name()", "() => props.punctuation"],
  absent: ["(Greeting, {"],
}
