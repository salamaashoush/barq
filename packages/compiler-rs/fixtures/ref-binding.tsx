
// There is no `useRef()` factory: a ref is a writable binding (B3)
// or a callback, and the `{current}` box the ref channel writes is one object
// literal. The SHAPE is what this fixture is about, and it is unchanged.
export const box: { current: HTMLDivElement | null } = { current: null }

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

// Reads the object ref back out: without this the object-ref path never reaches the DOM.
export const steps = [() => box.current?.setAttribute("data-ref-resolved", box.current.className)]
export const optimality = {
  target: 1,
  milestone: 5,
  templates: 1,
  patchCalls: 2,
  // B3: `ref` is a CHANNEL of its own, not a prop — the name never reaches
  // the runtime, and neither form is an attribute write. Baking either into the
  // template writes the string `[object Object]` into the markup and never
  // resolves the ref at all.
  emits: [", box)", ", (el: HTMLElement) =>"],
  absent: ['ref="', '"ref"'],
}

/**
 * The opcode table drops `Ref` on the SSR target: a ref resolves to a
 * NODE, and there are no nodes on the wire. The callback ref here is the whole
 * point — it mutates the element it is handed — so the DOM render carries a
 * `data-reffed` the string render structurally cannot.
 */
export const ssrDiffers = {
  markup: '<div><div class="boxed">target</div><span>callback</span></div>',
  why: "a ref callback is a client-only effect; §5 drops the Ref opcode",
}
