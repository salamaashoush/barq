import { Show, signal } from "@barqjs/core"

export const value = signal<string | null>("alpha")

const opts = { when: () => value(), fallback: () => "none" }

/**
 * `Show` behind a spread — the construct whose `keyed` really was two different
 * emitted programs, and the one M9's note about "different programs" was about.
 *
 * Nothing here can read `keyed`, so both programs are emitted and a test picks
 * between them at run time. `opts` carries no `keyed` at all, which reads as the
 * identity default, so what this fixture PINS is that the runtime arm agrees
 * with the static keyed arm: the key is the value, the body is handed the value,
 * and a rebuild happens whenever the value moves rather than only when its
 * truthiness flips.
 *
 * Step 0 is the frame that tells them apart — `alpha` to `beta` is a value
 * change with no truthiness change, so a non-keyed program would not rebuild and
 * the text would not move.
 */
export default function ControlFlowSpreadShow() {
  return (
    <div class="spread-show">
      <Show {...opts}>{(v) => <b class="shown">{v}</b>}</Show>
    </div>
  )
}

export const steps = [
  () => value.set("beta"),
  () => value.set(null),
  () => value.set("gamma"),
]

export const optimality = {
  target: 1,
  milestone: 10,
  templates: 2,
  // One `branch`, one body, and the keying test inside both the key and the
  // body — which is the whole of the third arm. `readSlot` is the Cell-slot read at
  // the one slot the compiler cannot resolve itself.
  emits: ["branch(", "readSlot(", "Show.keyed", ".when()", "?.("],
  absent: ["Show(", "ssrShow"],
}
