import { signal } from "@barqjs/core"

export const mode = signal<"a" | "b" | "none">("a")

export default function ConditionalChildren() {
  return (
    <div>
      {() => (mode() === "a" ? <span class="a">A</span> : mode() === "b" ? <em>B</em> : null)}
      <footer>end</footer>
    </div>
  )
}

export const steps = [() => mode.set("b"), () => mode.set("none"), () => mode.set("a")]

