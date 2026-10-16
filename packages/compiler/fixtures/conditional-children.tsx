import { createSignal } from "@barqjs/core"

export const [mode, setMode] = createSignal<"a" | "b" | "none">("a")

export default function ConditionalChildren() {
  return (
    <div>
      {() => (mode() === "a" ? <span class="a">A</span> : mode() === "b" ? <em>B</em> : null)}
      <footer>end</footer>
    </div>
  )
}

export const steps = [() => setMode("b"), () => setMode("none"), () => setMode("a")]

