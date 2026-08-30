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
  // `content.firstChild` only — and each of its children has to
  // become a root of its own.
  templates: 5,
  emits: ["<span>one</span>", "<b>deep</b>", "<span>two</span>"],
  // The nesting is preserved rather than flattened: flattening changes the
  // order the nodes are inserted in. A fragment is the ARRAY of its parts and
  // nothing else — there is no component behind it, so nothing re-derives at
  // run time what the nesting already says.
  absent: ['<div class="outer"><span>one</span>', "createElement"],
}
