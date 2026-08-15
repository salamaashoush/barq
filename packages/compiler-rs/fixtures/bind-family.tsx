import { linked, signal } from "@barqjs/core"

export const name = signal("ada")
export const notes = signal("first")
export const agreed = signal(false)
export const amount = signal(2)

/** R7 behind a control: the user's edit is a write, the source is a re-seed. */
export const server = signal("seeded")
export const draft = linked(server, (value) => value)

/**
 * CODESIGN §3.10 — the `bind:` family, resolved at compile time from the tag
 * and the `type`. Five channels, five reporting events, one shape.
 *
 * The corpus channels are the point of having it here rather than only under
 * `fixtures/semantics/`: the oracle differential runs the same source through
 * `createElement`, where `bindChannelOf` answers from the ELEMENT — so the two
 * resolutions are compared on every element in this file, which is the only
 * check that keeps `names.rs`'s table and `dom.ts`'s from drifting apart on a
 * case neither one's own tests happen to cover. The leak oracle counts the
 * listeners each `bind:` registers, and L2b checks the scope that owns them.
 *
 * `bind:group` is NOT here and the reason is a defect this fixture found rather
 * than a gap in the channel: a radio group needs `value="s"` on each member, and
 * the string backend drops a `value` attribute on every `<input>` — `ssr.ts`'s
 * `DIRTY_VALUE` is keyed by TAG, while the HTML spec puts the `value` IDL
 * attribute in "default/on" mode for `checkbox` and `radio`, where it reflects.
 * So SSR ships a radio with no value and the DOM builds one with a value. It is
 * pre-existing, it needs the input TYPE threaded through the `attr` ABI, and it
 * is named in SEMANTICS.md §9 B6 rather than papered over with `ssrDiffers`.
 * `bind:group` itself is driven, both directions, in
 * `fixtures/semantics/sem-form-selection-preserved.tsx`.
 */
export default function BindFamily() {
  return (
    <form class="bind-family">
      <input type="text" class="name" bind:value={name} />
      <textarea class="notes" bind:value={notes} />
      <input type="checkbox" class="agreed" bind:value={agreed} />
      <input type="number" class="amount" bind:value={amount} />
      <input type="text" class="draft" bind:value={draft} />
      <b class="echo">{() => `${name()}/${amount()}`}</b>
    </form>
  )
}

export const steps = [
  () => name.set("grace"),
  () => amount.set(9),
  () => server.set("reseeded"),
]

export const events = [
  (root: HTMLElement) => {
    const field = root.querySelector("input.name") as HTMLInputElement
    field.value = "typed"
    field.dispatchEvent(new Event("input", { bubbles: true }))
  },
  (root: HTMLElement) => {
    const box = root.querySelector("input.agreed") as HTMLInputElement
    box.checked = true
    box.dispatchEvent(new Event("change", { bubbles: true }))
  },
]

export const optimality = {
  target: 1,
  // M5, not M7: what this fixture DECLARES is the channel, and the channel is
  // M5's. M7's halves — the compare, the caret, the re-assertion — are
  // behavioural and are declared where behaviour is observed, in
  // `fixtures/semantics/`. A declaration for a milestone the harness has not
  // reached is an `it.todo`, which is a test that does not run.
  milestone: 5,
  templates: 1,
  // The property and the reporting event are STRINGS in the emitted call: the
  // runtime is told which channel, never asked to work it out. `valueAsNumber`
  // is the one the resolution is really about: a coercion the compiler took
  // from the `type` attribute and the runtime never re-derives.
  emits: ["bindValue(", '"value", "input"', '"checked", "change"', '"valueAsNumber", "input"'],
  absent: ["setProp", "bindChannelOf"],
}
