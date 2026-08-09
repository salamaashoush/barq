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
