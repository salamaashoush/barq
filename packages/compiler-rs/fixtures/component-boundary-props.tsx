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
