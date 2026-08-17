import { Portal } from "@barqjs/core"

export default function PortalFixture() {
  return (
    <div class="host">
      <div id="portal-target" />
      <Portal mount="#portal-target">
        <p class="teleported">over here</p>
      </Portal>
    </div>
  )
}
export const optimality = {
  target: 8,
  milestone: 5,
  templates: 2,
  // `Portal` renders its children into a container it appends elsewhere, so
  // they are nodes and target #8 hands them over as one clone. `mount` is a
  // literal string the runtime resolves with `querySelector`, and it is not one
  // of the five props anything unwraps.
  // `portal` is the one primitive that takes no `(parent, anchor)`: it returns
  // a marker standing at its LEXICAL position, and the patch inserts THAT — so
  // this is the one region that still costs an `insert`.
  emits: ["portal(", "insert(", "block("],
  // The adapter frame -O0 still pays: a props object carrying the two names the
  // primitive now takes positionally. `portal` never reads a flags integer —
  // it activates in a microtask where the instance scope is what restores the
  // ambient owner — so the region ships none however the branch proof went.
  absent: ["Portal(", "mount: ", "children: "],
}
