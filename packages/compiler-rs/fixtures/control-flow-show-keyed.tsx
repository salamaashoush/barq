import { Show, signal } from "@barqjs/core"

export const value = signal<{ name: string } | null>({ name: "alpha" })

/**
 * `<Show keyed>` — the arm that OPTS IN to rebuilding on a value change, and
 * since M10 the one that has to be asked for.
 *
 * Keyed makes the value itself the key, so a new object is a new instance: the
 * content is torn down and rebuilt even though truthiness never moved. The body
 * parameter is the raw value, not an accessor, which is why `{v.name}` reads
 * correctly here and would be a type error under the default.
 *
 * That teardown is the whole difference and it is not free — it is what
 * destroys focus, a caret, a running animation and a `<video>`'s position. The
 * default is non-keyed for exactly that reason; this arm exists for the case
 * where the value really IS the identity of the content.
 *
 * Step 0 is the only frame that can tell the two apart, because the first frame
 * is identical under both — the same reason the `keyed={fn}` miscompile hid
 * from 110 fixtures.
 */
export default function ControlFlowShowKeyed() {
  return (
    <div class="keyed-show">
      <Show when={() => value()} keyed fallback={<i>none</i>}>
        {(v) => <b class="shown">{v.name}</b>}
      </Show>
    </div>
  )
}

export const steps = [
  // A NEW object, same truthiness. Keyed rebuilds; the default would not.
  () => value.set({ name: "beta" }),
  () => value.set(null),
  () => value.set({ name: "gamma" }),
]

export const optimality = {
  target: 1,
  milestone: 10,
  templates: 2,
  // The value IS the key, and one body serves every key — no two-row table,
  // because the arm is decided by the value rather than by an index.
  emits: ["branch(", "|| false", ", v) =>"],
  absent: ["Show(", "? 1 : 0"],
}
