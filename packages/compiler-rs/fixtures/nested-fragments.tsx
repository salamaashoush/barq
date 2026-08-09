import { signal } from "@barqjs/core"

export const label = signal("mid")

export default function NestedFragments() {
  return (
    <div class="outer">
      <>
        <span>one</span>
        <>
          <span>{() => label()}</span>
          <b>deep</b>
        </>
        <span>two</span>
      </>
    </div>
  )
}

export const steps = [() => label.set("changed")]
export const optimality = {
  target: 2,
  milestone: 5,
  // Five: the host, and one per static subtree the fragments hold. A fragment
  // is not an element, so it cannot be a template root — `template()` returns
  // `content.firstChild` only (DESIGN §8 V5) — and each of its children has to
  // become a root of its own.
  templates: 5,
  emits: ["Fragment", "<span>one</span>", "<b>deep</b>", "<span>two</span>"],
  // The nesting is preserved rather than flattened: flattening changes what
  // `childToNodes` walks and the order nodes are inserted in.
  absent: ['<div class="outer"><span>one</span>'],
}
