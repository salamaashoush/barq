import { signal } from "@barqjs/core"

export const total = signal(0)

/**
 * The whole of "fine-grained flow across a component boundary", stated as a
 * divergence rather than as a claim about emitted code.
 *
 * `createElement` builds its own props object (`{ ...props }`, dom.ts:309), so
 * the un-compiled path hands `Badge` a SNAPSHOT of `total()` and the cell can
 * never change again. A compiled call site is a direct call whose reactive prop
 * is a GETTER, so the read inside `Badge` stays live and the cell updates. Same
 * initial DOM, and the oracle is the one that is wrong afterwards.
 *
 * Both halves are RAW on purpose. The prop is a bare `total()` at the call site
 * and a bare `props.count` at the read, with no author-written accessor
 * anywhere: routing either end through `() => …` would prove only that the
 * compiler passes a function through, which an identity compiler also does.
 * `props` is `SourceKind::PropsParam` — assigned in P0 from the shape of the
 * function, never from its name — and that is what makes the read live.
 */
function Badge(props: { count: number }) {
  return <b class="badge">{props.count}</b>
}

export default function ComponentGetterProps() {
  return (
    <div class="wrap">
      <Badge count={total()} />
    </div>
  )
}

export const steps = [() => total.set(7)]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 2,
  // A direct call whose reactive prop is a getter. Both halves matter: the
  // getter is what keeps the read live, and the direct call is what stops
  // `createElement` copying it back into a value.
  emits: ["count: () => total()", "props.count", "Badge("],
  // The argument shape a `createElement` call would have. Naming the helper
  // itself would be satisfied by the prose above, which explains what it does.
  absent: ["(Badge, {"],
}
