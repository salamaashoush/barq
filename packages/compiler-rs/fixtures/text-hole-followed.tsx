import { signal } from "@barqjs/core"

export const count = signal(0)

export default function TextHoleFollowed() {
  return (
    <div>
      {() => count()}
      <span class="suffix">items</span>
    </div>
  )
}

export const steps = [() => count.set(3), () => count.set(7)]

export const optimality = {
  target: 9,
  milestone: 3,
  templates: 1,
  patchCalls: 1,
  // Something DOES follow the hole, and it is still not a comment: the <span>
  // that follows is a stable node, so it is the anchor and no marker is baked.
  // A marker is only needed where the next thing is text the template fuses.
  absent: ["<!---->"],
}
