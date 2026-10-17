import { createSignal } from "@barqjs/core"

export const [name, setName] = createSignal("world")

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

export const steps = [() => setName("barq")]

export const optimality = {
  target: 1,
  templates: 2,
  // Both props are read through a `PropsParam` binding, so both become live
  // reads inside the callee — including `punctuation`, which the caller passed
  // as a literal. The compiler cannot know the caller, and a component that is
  // reactive only for some of its callers is not reactive.
  emits: ["Greeting(", "() => props.name()", "punctuation: "],
  absent: ["(Greeting, {"],
}
