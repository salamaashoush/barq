import { createSignal, untrack } from "@barqjs/core"

export const [count, setCount] = createSignal(0)
export const [seen, setSeen] = createSignal(0)

/**
 * `count()` in the hole is a tracked read. The setter is a function the
 * handler calls, and `untrack(count)` is a read that subscribes nothing: the
 * same signal, three verdicts, and none of them decided from a name.
 */
export default function SignalMethodsInHandler() {
  return (
    <button
      type="button"
      class="methods"
      data-seen={() => String(seen())}
      onClick={() => {
        setCount((n) => n + 1)
        setSeen(untrack(count))
      }}
    >
      {() => count()}
    </button>
  )
}

export const events = [
  (root: HTMLElement) => root.querySelector("button")?.click(),
  (root: HTMLElement) => root.querySelector("button")?.click(),
]

export const optimality = {
  target: 1,
  templates: 1,
  patchCalls: 2,
  // One signal, three verdicts: the hole's read is tracked, the setter call and
  // the untracked read are not.
  emits: ["setCount(", "untrack(count)", "setSeen("],
  absent: ["count().", "seen()."],
}
