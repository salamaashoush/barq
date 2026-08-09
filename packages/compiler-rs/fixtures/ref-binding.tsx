import { useRef } from "@barqjs/core"

export const box = useRef<HTMLDivElement>()

export default function RefBinding() {
  return (
    <div>
      <div ref={box} class="boxed">
        target
      </div>
      <span ref={(el: HTMLElement) => el.setAttribute("data-reffed", "yes")}>callback</span>
    </div>
  )
}

// Reads the object ref back out: without this the useRef path never reaches the DOM.
export const steps = [() => box.current?.setAttribute("data-ref-resolved", box.current.className)]
export const optimality = {
  target: 1,
  milestone: 5,
  templates: 1,
  patchCalls: 2,
  // `ref` is a runtime channel, not an attribute: both the object form and the
  // callback form are handed to `setProp`, which is where `dom.ts` applies them
  // exactly once. Baking either into the template writes the string
  // `[object Object]` into the markup and never resolves the ref at all.
  emits: ['"ref", box', '"ref", (el: HTMLElement) =>'],
  absent: ['ref="'],
}

/**
 * DESIGN §5's opcode table drops `Ref` on the SSR target: a ref resolves to a
 * NODE, and there are no nodes on the wire. The callback ref here is the whole
 * point — it mutates the element it is handed — so the DOM render carries a
 * `data-reffed` the string render structurally cannot.
 */
export const ssrDiffers = {
  markup: '<div><div class="boxed">target</div><span>callback</span></div>',
  why: "a ref callback is a client-only effect; §5 drops the Ref opcode",
}
