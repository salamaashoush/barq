import { Errored, For, Show, signal } from "@barqjs/core"

export const items = signal<string[]>(["a", "b"])
export const on = signal(true)
export const failing = signal(true)
export const note = signal("recovering")

function Flaky() {
  if (failing()) throw new Error("nope")
  return <p class="ok">ok</p>
}

/**
 * The η-reduction whitelist, from BOTH sides in one module.
 *
 * `unwrapped_by` names five props — `each`, `count`, `when`, `component`, `on` —
 * that the runtime really does unwrap with
 * `typeof raw === "function" ? raw() : raw`. For exactly those, `() => acc()` and
 * `acc` are the same value and the arrow is dead weight, so the compiler drops
 * it. For every other prop the runtime STORES what it is handed and decides for
 * itself what to do with it, and reducing the arrow away is the compiler
 * deciding something about a contract it cannot see.
 *
 * `Errored.fallback` is the negative half, and it is the sharpest case there is:
 * the runtime calls it with `(error, reset)`. Handing it the raw accessor works
 * only by accident — a signal ignores extra arguments — and the moment the
 * author's arrow does anything with its own scope, η-reduction has changed what
 * the callee receives.
 *
 * Both halves have to be in the same module. A compiler that reduced nothing
 * satisfies the negative half on its own; one that reduced every non-`children`
 * prop satisfies the positive half on its own. Widening the whitelist to "every
 * prop but `children`" was a fully green mutation across the whole corpus and
 * the whole JS suite before this fixture existed, because no fixture put an
 * η-reducible arrow on a prop outside the five.
 */
export default function FlowPropEtaBoundary() {
  return (
    <div class="eta">
      <Show when={() => on()}>{() => <p class="body">shown</p>}</Show>
      <For each={() => items()}>{(item: string) => <span class="row">{item}</span>}</For>
      <Errored fallback={() => note()}>{() => <Flaky />}</Errored>
    </div>
  )
}

export const steps = [
  () => on.set(false),
  () => items.set([]),
  () => note.set("still recovering"),
  () => on.set(true),
  () => items.set(["c"]),
]

export const optimality = {
  target: 8,
  milestone: 5,
  templates: 4,
  // η-reduction is UNIVERSAL after M3 rather than a five-name whitelist: a
  // zero-arity function IS a Cell (§3.0 rule 1), so `() => note()` and `note`
  // are the same carrier and the reduced one allocates nothing. The boundary
  // this fixture draws therefore moved from WHICH PROP to WHAT SHAPE, and the
  // negatives below are what still says the reduction happened.
  // Since M4b the reduction is visible in the PRIMITIVE's argument list rather
  // than in a prop: `when` became the branch's key expression, `each` became
  // the source `each` takes, and the boundary's fallback is the Cell itself.
  // Three constructs, three different primitives, one module — so a pass that
  // lowered only the shape it was written against fails here rather than on a
  // fixture nobody looked at.
  emits: [
    "branch(",
    "() => on() || false",
    "each(",
    ", items, null, ",
    "boundary(",
    '"error", note, ',
  ],
  absent: [
    "when: ",
    "each: ",
    "fallback: ",
    "() => items()",
    "() => note()",
    "Show(",
    "For(",
    "Errored(",
  ],
}
