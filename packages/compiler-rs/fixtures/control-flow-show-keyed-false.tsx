import { Show, signal } from "@barqjs/core"

export const value = signal<string | null>("alpha")

/**
 * `<Show keyed={false}>` written EXPLICITLY, which is the default since M10 —
 * the fixture is kept at its own name because a fixture is never deleted, and
 * it earns its place by pinning that the explicit spelling and the absent one
 * agree.
 *
 * Non-keyed re-renders only when TRUTHINESS flips, so across a value change the
 * content stays mounted and only its reads move. That makes the body parameter
 * an accessor, and `analysis::bind::row_params` did not say so: it typed `For`
 * and `Repeat` and returned early for everything else, so `{v()}` was an opaque
 * call the classifier applied ONCE and the text froze at activation. It is the
 * by-item `For` bug (V8) in the construct beside it.
 *
 * Step 0 is the only frame that can see it. `alpha` to `beta` is a value change
 * with no truthiness change, so a frozen read and a live one agree on every
 * other frame — which is exactly why 131 fixtures missed it.
 */
export default function ControlFlowShowKeyedFalse() {
  return (
    <div class="keyed-false-show">
      <Show when={() => value()} keyed={false} fallback={<i>none</i>}>
        {(v) => <b class="shown">{v()}</b>}
      </Show>
    </div>
  )
}

export const steps = [
  // The frame that tells a live read from a frozen one.
  () => value.set("beta"),
  () => value.set(null),
  () => value.set("gamma"),
]

export const optimality = {
  target: 1,
  milestone: 10,
  templates: 3,
  // The key is the truthiness index and the body is the two-row table. The
  // read η-reduces to the accessor, which is the whole claim: a bare name in
  // the hole is what a LIVE binding looks like here.
  emits: ["branch(", "? 1 : 0", ", v) =>"],
  absent: ["Show(", "v())"],
}
