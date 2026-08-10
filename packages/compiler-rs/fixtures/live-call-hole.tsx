import { signal } from "@barqjs/core"

export const count = signal("1")
export const label = signal("c1")

/**
 * η-reduction's negative half, on the plainest shape there is.
 *
 * `count()` is a call to a zero-argument accessor binding, so `Thunk::Eta` says
 * `() => count()` and `count` are the same value and the arrow is dead weight.
 * `String(count())` is a call too, and it is not that: reducing it hands the
 * runtime `String` itself, which `insert` then calls with no arguments.
 *
 * The whitelist had exactly ONE killing test in the whole project — a mutation
 * that made η-reduction fire on any call was caught by `component-function-props`
 * and by nothing else — so a single edit to that fixture would have left the
 * optimisation unguarded. Both spellings are here in one element: the reducible
 * read as the contrast, and the call around one as the claim.
 *
 * The `<b>` is the control, and it is what keeps this fixture's steps out of the
 * inert list: an explicit thunk is live on BOTH paths, so step 1 moves the
 * oracle's DOM as well as the compiled one.
 */
export default function LiveCallHole() {
  return (
    <p class="call-hole" title={count()} data-text={String(count())}>
      {String(count())}
      <b class="control" title={() => label()}>
        c
      </b>
    </p>
  )
}

export const steps = [() => count.set("5"), () => label.set("c2")]

export const goesLive = ["title/data-text, one group", "{String(count())}"]

export const wins = [
  {
    kind: "step" as const,
    index: 0,
    compiled:
      '<p class="call-hole" data-text="5" title="5">5<b class="control" title="c1">c</b></p>',
    why: "the oracle read count() once at createElement time; the compiled path bound both holes",
  },
  {
    kind: "step" as const,
    index: 1,
    compiled:
      '<p class="call-hole" data-text="5" title="5">5<b class="control" title="c2">c</b></p>',
    why: "the step-0 divergence persists into every later frame",
  },
]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 1,
  // The hole keeps its arrow. Reduced, `insert` would be handed `String` itself.
  emits: ["() => String(count())"],
  absent: [", String)"],
}
