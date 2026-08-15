import { signal } from "@barqjs/core"

export const tone = signal("red")

/**
 * B1's falsification procedure, written as a fixture: `<b class={s()} id={s()}
 * title={s()} />`, write `s`, and **all three** must change.
 *
 * Until M5 `class` was emitted as a dead one-shot beside two live siblings —
 * the same three characters of source producing two different liveness answers
 * because of the name. The cause was `NameFlags::STATEFUL_DIFF`, an early return
 * in `classify` that refused to make an intercepted name live at all.
 *
 * The bare-read spelling is the one the rule states, and it is not the same
 * shape as `class-with-live-siblings`'s explicit thunks: an author who writes
 * `{s()}` never wrote a closure, so the compiler's own auto-thunking is what has
 * to treat the three names alike. This is where that is asserted.
 */
export default function EqualLiveness() {
  return <b class={tone()} id={tone()} title={tone()} />
}

export const steps = [() => tone.set("blue"), () => tone.set("green")]

/**
 * ONE entry for THREE holes, and that is B2's arithmetic rather than a slip.
 * `goesLive` buys effect-count slack, and every bare read on this element is a
 * field of the same record — so three holes that the oracle reads once cost the
 * compiled path exactly one effect between them. Listing three would be a stale
 * declaration and the harness says so.
 */
export const goesLive = [
  "<b class={tone()} id={tone()} title={tone()}> — three bare reads, one fused effect",
]

/**
 * The oracle reads each hole once at `createElement` time and freezes there, so
 * every frame after the first is a divergence the compiled path is RIGHT about.
 * That is the same statement `auto-thunked-read` makes; this fixture makes it
 * about three names that used to disagree with each other.
 */
export const wins = [
  {
    kind: "step" as const,
    index: 0,
    compiled: '<b class="blue" id="blue" title="blue"></b>',
    why: "the oracle read tone() once at construction; the compiled path bound all three",
  },
  {
    kind: "step" as const,
    index: 1,
    compiled: '<b class="green" id="green" title="green"></b>',
    why: "and `class` moves with its siblings, which is the whole of B1",
  },
]

export const optimality = {
  target: 4,
  milestone: 5,
  effects: 1,
  templates: 1,
  // three channel writes, all of them inside one effect
  patchCalls: 3,
  // One effect for the element, with all three names written from inside it.
  emits: ["bindEffect(", "setClass(", '"id"', '"title"'],
  // No name reaches the runtime as a question, and no name is excluded from the
  // record on account of being `class`.
  absent: ["bindProp(", "setProp", 'class="'],
}
