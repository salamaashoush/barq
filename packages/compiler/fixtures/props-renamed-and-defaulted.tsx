import { createSignal } from "@barqjs/core"

export const [label, setLabel] = createSignal("first")

/**
 * Renamed and defaulted at once: `text: body` binds a different local name to
 * the prop, and `tone = "warm"` supplies a value when the prop is absent. Both
 * names are reads of the prop, so the default applies whenever the prop is
 * `undefined` and not only when the component first runs.
 */
function Chip(props: { text: () => string; tone?: string }) {
  const { text: body, tone = "warm" } = props
  return (
    <span class="chip" data-tone={tone}>
      {body}
    </span>
  )
}

export default function PropsRenamedAndDefaulted() {
  return (
    <div class="chips">
      <Chip text={() => label()} />
      <Chip text={() => "static"} tone="cool" />
    </div>
  )
}

export const steps = [() => setLabel("second")]

export const optimality = {
  target: 1,
  templates: 2,
  // Renaming and defaulting are ordinary destructuring, so they stay live like
  // the other two. The prop the caller OMITS must be omitted from the object
  // as well — emitting `tone: undefined` would defeat the default.
  emits: ["text: label", '() => "cool"'],
  absent: ["tone: undefined", "(Chip, {"],
}
