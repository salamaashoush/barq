import { createSignal } from "@barqjs/core"

export const [leaf, setLeaf] = createSignal("L")

export default function DeepWalk() {
  return (
    <div>
      <div>
        <div>
          <div>
            <div>
              <span class="deep">{() => leaf()}</span>
            </div>
          </div>
        </div>
      </div>
      <p>sibling</p>
    </div>
  )
}

export const steps = [() => setLeaf("LL")]

export const optimality = {
  target: 5,
  milestone: 3,
  templates: 1,
  patchCalls: 1,
  // Five nested single-child divs, so five hops is the cheapest route there is
  // and `lastChild` buys nothing. The claim is that nothing is spent on top of
  // it: no anchor to walk to, no sibling hop for the <p> that follows.
  absent: [".nextSibling", ".lastChild", "<!---->"],
}
