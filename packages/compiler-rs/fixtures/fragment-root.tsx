import { signal } from "@barqjs/core"

export const label = signal("mid")

/**
 * A component whose ROOT is a fragment. `template()` returns `content.firstChild`
 * and nothing else, so a multi-root unit cannot be one template — it is one
 * template per root plus an array, and `insert` and `render` both have to
 * accept that array.
 */
export default function FragmentRoot() {
  return (
    <>
      <h2 class="head">head</h2>
      <p class="body">{() => label()}</p>
      <footer class="foot">foot</footer>
    </>
  )
}

export const steps = [() => label.set("changed")]

export const optimality = {
  target: 2,
  milestone: 4,
  // `template()` returns `content.firstChild` and nothing else, so a three-root
  // fragment is three templates and an array — not one template holding three
  // siblings, which would silently render only the first.
  templates: 3,
  patchCalls: 1,
  emits: ['<h2 class="head">head</h2>', '<footer class="foot">foot</footer>'],
  absent: ["createElement"],
}
