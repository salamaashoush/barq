import { Match, Switch, signal } from "@barqjs/core"

export const status = signal<"loading" | "ready">("loading")

function Spinner() {
  return <span class="spinner">…</span>
}

function Content() {
  return <p class="content">done</p>
}

/**
 * `Match` is not a ternary: it returns its own props object and `Switch` reads
 * it, so the DOM target has to emit real `Match({ when, children })` calls
 * inside `Switch({ children: [...] })`. Here each branch is a USER component,
 * which is the shape the dead plugin covered and the one where collapsing
 * `Match` into a conditional expression stops type-checking as well as
 * stopping working.
 */
export default function SwitchMatchComponentBodies() {
  return (
    <div class="switch">
      <Switch fallback={<em class="none">none</em>}>
        <Match when={() => status() === "loading"}>{() => <Spinner />}</Match>
        <Match when={() => status() === "ready"}>{() => <Content />}</Match>
      </Switch>
    </div>
  )
}

export const steps = [() => status.set("ready"), () => status.set("loading")]
export const optimality = {
  target: 8,
  milestone: 5,
  templates: 4,
  // DESIGN §8 V9: on the DOM target `Match` is a real call. It returns its own
  // props object and `Switch` reads it, so collapsing the pair into a ternary —
  // which is what the SSR backend does, and only the SSR backend — produces a
  // `Switch` with nothing to read. The component bodies are ordinary calls with
  // an empty props object, not `createElement`.
  emits: ["Switch({", "children: [Match({", "Spinner({})", "Content({})"],
  absent: ["(Switch, {", "(Match, {", "createElement("],
}
