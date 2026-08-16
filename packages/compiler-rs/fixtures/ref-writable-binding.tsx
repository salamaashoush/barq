/**
 * SEMANTICS B3 — a ref is not a prop.
 *
 * `<i ref={box}>` with a WRITABLE binding compiles to `box = _el`. Before M5 it
 * compiled to a prop write, which READS the variable and never writes it — so
 * the binding stayed `undefined` and every consumer of it was silently dead.
 * The step below reads it back, which is the only way a DOM comparison can see
 * a variable at all.
 *
 * The un-compiled path cannot do this and the divergence is declared rather
 * than hidden: a props object receives the binding's VALUE, so there is nothing
 * for it to assign to. That is the whole content of "a ref is a channel", and
 * it is why a runtime-only design cannot pay it.
 */
let box: HTMLElement | undefined

export default function RefWritableBinding() {
  return (
    <p>
      <i ref={box} class="k">
        x
      </i>
    </p>
  )
}

export const steps = [() => box?.setAttribute("data-el", box.className)]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 1,
  patchCalls: 0,
  // No channel call at all: the assignment IS the emission.
  emits: ["box = "],
  absent: ["ref(", "setProp"],
}
