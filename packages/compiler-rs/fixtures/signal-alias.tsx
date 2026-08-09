import { signal } from "@barqjs/core"

export const count = signal(1)
/** `const c = count` — the alias is an Accessor because its RHS is one. */
const alias = count
/** And calling it once at module scope is NOT: `total` is a plain number. */
const total = count.peek() + 40

export default function SignalAlias() {
  return (
    <div class="alias" data-total={String(total)}>
      {() => alias() + 1}
    </div>
  )
}

export const steps = [() => count.set(4), () => count.set(-1)]

export const optimality = {
  target: 1,
  milestone: 4,
  templates: 1,
  patchCalls: 2,
  // `alias` IS `count`, so the hole keeps its arrow and stays live. `total` is
  // a peek plus arithmetic — never reactive — so it is applied ONCE, unwrapped,
  // with no thunk and no effect around it. A name-matching compiler sees two
  // `const`s in one module and has no way to tell them apart.
  //
  // `String(total)` does not fold into the template: P3 refuses a call it
  // cannot evaluate, which is the conservative half of target 3 and is stated
  // here so that folding it later is a visible change rather than a silent one.
  emits: ['"data-total", String(total)', "() => alias() + 1"],
  absent: ["() => String(total)"],
}
