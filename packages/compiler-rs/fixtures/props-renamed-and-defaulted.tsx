import { signal } from "@barqjs/core"

export const label = signal("first")

/**
 * Renamed and defaulted at once: `text: body` binds a different local name to
 * the prop, and `tone = "warm"` supplies a value when the prop is absent. A
 * default is a read of the prop plus a branch, so the getter fires exactly once
 * per pattern element and never again.
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

export const steps = [() => label.set("second")]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 2,
  // Renaming and defaulting are ordinary destructuring, so they snapshot like
  // the other two. The prop the caller OMITS must be omitted from the object
  // as well — emitting `tone: undefined` would defeat the default.
  emits: ["Chip({ text: () => label() })", 'tone: "cool"'],
  absent: ["tone: undefined", "(Chip, {"],
}
