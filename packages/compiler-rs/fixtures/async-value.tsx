import { computed, signal } from "@barqjs/core"

export const who = signal("ada")

/**
 * `computed` without a key is a `Computed<T>`, so the value is behind a CALL
 * and `user.name` is a member read on the accessor itself — the read has to be
 * `user().name`, and `user` alone is inert.
 */
const user = computed(() => ({ name: who() }))

export default function AsyncValue() {
  return (
    <div class="async">
      <span>{() => user().name}</span>
    </div>
  )
}

export const steps = [() => who.set("grace"), () => who.set("hopper")]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 1,
  // `computed` returns an Accessor like `computed` does, so the CALL is the
  // tracked read and the member on its result rides along inside one thunk —
  // not two reads and not a member on an Opaque object.
  emits: ["() => user().name"],
  absent: ["get name()"],
}
