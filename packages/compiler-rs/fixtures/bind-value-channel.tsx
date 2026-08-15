import { signal } from "@barqjs/core"

export const text = signal("hi")

/**
 * CODESIGN §3.10 — the `bind:` CHANNEL. The property a user edit lands on and
 * the event that reports it are resolved at compile time from the tag and the
 * `type` attribute: a text input writes `value` and reports on `input`, a
 * checkbox writes `checked` and reports on `change`.
 *
 * Only the channel is M5's. Selection and focus preservation — the half that
 * needs the write to compare against the ELEMENT rather than against the last
 * framework write for the whole user-mutable set — is M7, and nothing here
 * claims it.
 */
export default function BindValueChannel() {
  return (
    <label>
      <input type="text" bind:value={text} />
      <b>{() => text()}</b>
    </label>
  )
}

export const steps = [() => text.set("edited")]

export const events = [
  (root: HTMLElement) => {
    const input = root.querySelector("input") as HTMLInputElement
    input.value = "typed"
    input.dispatchEvent(new Event("input", { bubbles: true }))
  },
]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 1,
  // The property and the reporting event are STRINGS in the emitted call: the
  // runtime is told which channel, never asked to work it out.
  emits: ["bindValue(", '"value", "input"'],
  absent: ["setProp", "addEventListener"],
}
