import { signal } from "@barqjs/core"

export const mode = signal<"a" | "b" | "none">("a")

export default function ConditionalChildren() {
  return (
    <div>
      {() => (mode() === "a" ? <span class="a">A</span> : mode() === "b" ? <em>B</em> : null)}
      <footer>end</footer>
    </div>
  )
}

export const steps = [() => mode.set("b"), () => mode.set("none"), () => mode.set("a")]

// The un-compiled path appends this hole with `marker = null`, so when the hole
// re-renders, `insert` reconciles against "the end of the parent" and the new
// node lands AFTER <footer>. The compiled path keeps an anchor for the hole, so
// the replacement lands where the source puts it. Same initial DOM, and the
// oracle is the one that is wrong afterwards.
export const wins = [
  {
    kind: "step" as const,
    index: 0,
    compiled: "<div><em>B</em><footer>end</footer></div>",
    why: "createElement appends the hole with no anchor, so its replacement moves to the end",
  },
  {
    kind: "step" as const,
    index: 2,
    compiled: '<div><span class="a">A</span><footer>end</footer></div>',
    why: "createElement appends the hole with no anchor, so its replacement moves to the end",
  },
]
