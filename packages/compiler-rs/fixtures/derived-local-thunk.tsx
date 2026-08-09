import { signal } from "@barqjs/core"

export const count = signal(1)

/**
 * A chain of plain local arrows, each reading the one before it. No primitive
 * call anywhere — the reactivity has to be carried through two ordinary
 * `const` bindings by their initialisers alone, and a bare accessor handed
 * straight to a hole must not be wrapped a second time.
 */
export default function DerivedLocalThunk() {
  const doubled = () => count() * 2
  const quadrupled = () => doubled() * 2
  return (
    <p class="chain">
      <span>{doubled}</span>
      <b>{quadrupled}</b>
    </p>
  )
}

export const steps = [() => count.set(3), () => count.set(0)]
export const optimality = {
  target: 1,
  milestone: 5,
  templates: 1,
  patchCalls: 2,
  // Reactivity carried through two ordinary `const` bindings by their
  // initialisers alone — no primitive call anywhere for a name matcher to see.
  // Each accessor is handed to its hole BARE: wrapping it would build one
  // closure per hole for a function that is already exactly the thunk `insert`
  // wants.
  emits: [", doubled)", ", quadrupled)"],
  absent: [", () => doubled())", ", () => quadrupled())"],
}
