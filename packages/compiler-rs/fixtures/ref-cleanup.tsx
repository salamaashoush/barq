export const seen: string[] = []

/**
 * A ref callback that returns an UNDO. `ref` runs it when the scope that owns
 * the element is disposed, and nothing in the corpus exercised that: every
 * other ref fixture hands out an object ref or a callback that only writes an
 * attribute, so a `ref` that dropped its cleanup entirely survived every
 * channel in the repository (`test/runtime-mutants.ts`, `ref-drops-its-cleanup`).
 *
 * The undo is made observable by giving it something to undo — a raw listener
 * the leak oracle can match against its removal. `my-beep` is nothing the
 * document dispatches, so the listener is the fixture's own and not a channel's.
 */
export default function RefCleanup() {
  return (
    <div class="host">
      <button
        type="button"
        ref={(el: HTMLElement) => {
          const beep = () => seen.push("beep")
          el.addEventListener("my-beep", beep)
          return () => el.removeEventListener("my-beep", beep)
        }}
      >
        ref cleanup
      </button>
    </div>
  )
}

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 1,
  patchCalls: 1,
  emits: ["ref("],
  absent: ['ref="', '"ref"'],
}
