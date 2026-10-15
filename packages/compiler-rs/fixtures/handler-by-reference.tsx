import { createSignal } from "@barqjs/core"

export const [n, setN] = createSignal(0)

const bump = () => setN((v) => v + 1)

/**
 * The commonest handler shape in real code, and the one target #7 used to miss:
 * a handler bound to a name rather than written inline. `bump` is `const` and
 * never reassigned, so the binding IS the callable and the expando can be
 * written directly — no `setProp`, no runtime `isEventHandlerValue` check.
 *
 * `reset` is declared inside the component and captures nothing that would
 * survive hoisting, which is the case that must NOT be moved to module scope:
 * the reference is emitted where it stands.
 */
export default function HandlerByReference() {
  const reset = () => setN(0)
  return (
    <div>
      <button type="button" onClick={bump}>
        {() => n()}
      </button>
      <button type="button" onClick={reset}>
        reset
      </button>
    </div>
  )
}

export const events = [
  (root: HTMLElement) => root.querySelectorAll("button")[0]?.click(),
  (root: HTMLElement) => root.querySelectorAll("button")[0]?.click(),
  (root: HTMLElement) => root.querySelectorAll("button")[1]?.click(),
]

export const optimality = {
  target: 7,
  milestone: 3,
  templates: 1,
  emits: ["__bq_click = bump", "__bq_click = reset"],
  absent: ["addEventListener", '"onClick"'],
}
