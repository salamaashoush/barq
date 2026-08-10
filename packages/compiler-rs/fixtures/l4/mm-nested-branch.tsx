/**
 * MM3 across nesting: the OUTER key never moves while the inner one does.
 *
 * The outer branch must not notice — its scope, its own node and the inner
 * region's position all survive — and only the inner arm's node comes and goes.
 * A runtime that re-activated an enclosing branch whenever anything below it
 * moved would produce byte-identical markup and be invisible to every other
 * channel in the repository.
 *
 * The inner `Show` has no fallback on purpose, so the transition is a pure
 * growth and a pure shrink rather than a swap: the class then says exactly one
 * thing about every element in the frame.
 */
import { Show, signal } from "@barqjs/core"

export const log: string[] = []

export const outer = signal(true)
export const inner = signal(false)

export default function NestedBranch() {
  return (
    <div class="outer-host">
      <Show when={() => outer()} fallback={<span class="outer-closed">closed</span>}>
        {() => {
          log.push("outer")
          return (
            <section class="outer-body">
              <Show when={() => inner()}>
                {() => {
                  log.push("inner")
                  return <b class="inner-body">yes</b>
                }}
              </Show>
            </section>
          )
        }}
      </Show>
    </div>
  )
}

export const steps = [() => inner.set(true), () => inner.set(false)]

export const metamorphic = {
  why: "the inner key moves and the outer one does not, so only the inner arm's node changes",
  steps: ["grows", "shrinks"],
}

export const c7 = {
  why: "the outer Block is activated once; the inner one once, when its arm is selected",
  log: ["outer", "inner"],
}
