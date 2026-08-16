import { store } from "@barqjs/core"

/**
 * `store` returns `[proxy, setter]` and ANY member read on the proxy is a
 * tracked read — `SourceKind::ReactiveObject`. Nothing about the NAME `state`
 * says so, and a nested read (`state.user.name`) has to stay reactive to the
 * depth it was written at.
 */
const [state, setState] = store({ user: { name: "John" }, count: 0 })

export default function StoreMember() {
  return (
    <div class="store">
      <span class="name">{() => state.user.name}</span>
      <em data-count={() => String(state.count)}>n</em>
    </div>
  )
}

export const steps = [
  () => setState("user", "name", "Jane"),
  () => setState("count", 3),
  () => setState({ count: 7 }),
]

export const optimality = {
  target: 1,
  milestone: 4,
  templates: 1,
  patchCalls: 2,
  // A store proxy is read as a MEMBER, never called. `state()` throws.
  emits: ["state.user.name", "state.count"],
  absent: ["state()"],
}
