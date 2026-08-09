import { signal } from "@barqjs/core"
import type { Child } from "@barqjs/core"

export const badge = signal(3)

/**
 * A user-defined component with JSX CHILDREN, sitting between static siblings —
 * the dead plugin's "component children become insert holes; surrounding
 * statics stay in template" case, and the shape half of real application code
 * is written in.
 *
 * Nothing else in the corpus reaches it. Every other `children` in the fixtures
 * belongs to a FLOW component, whose children the runtime calls itself; this one
 * crosses an ordinary props boundary as a value the callee splices with a plain
 * hole, so `props.children` is read by code the compiler emitted for the CALLEE
 * while the array was built by code it emitted for the CALLER.
 *
 * Three children, not one: `createElement(Panel, props, a, b, c)` collects them
 * into an array, and a compiled call site that handed over a single node — or
 * that handed over three separate props — would render the same first frame and
 * diverge on the second.
 */
function Panel(props: { title: string; children?: Child | Child[] }) {
  return (
    <section class="panel">
      <h2 class="panel__title">{props.title}</h2>
      <div class="panel__body">{props.children}</div>
    </section>
  )
}

export default function ComponentChildrenSlot() {
  return (
    <main class="page">
      <p class="lead">before</p>
      <Panel title="Inbox">
        <span class="item">one</span>
        <b class="count">{() => badge()}</b>
        <span class="item">two</span>
      </Panel>
      <p class="tail">after</p>
    </main>
  )
}

export const steps = [() => badge.set(7), () => badge.set(0)]

// Both props are read through a `PropsParam` binding, so the compiled callee
// binds where `createElement` copied the props object once — including
// `children`, which the caller handed over as a built array.
export const goesLive = ["Panel title", "Panel children"]

export const optimality = {
  target: 1,
  milestone: 5,
  // Five: the callee's own markup, the caller's page frame, and one per child
  // handed across the boundary.
  templates: 5,
  // The children cross as ONE `children` prop holding an array, in source
  // order, and the statics either side of the component stay baked into the
  // caller's frame instead of becoming holes.
  emits: [
    "Panel({",
    '"Inbox"',
    "children: [",
    '<p class="lead">before</p>',
    '<p class="tail">after</p>',
  ],
  // A component call, never `createElement`; and `title` is a literal the
  // caller wrote, so nothing wraps it in a getter it does not need.
  absent: ["(Panel, {", "get title()"],
}
