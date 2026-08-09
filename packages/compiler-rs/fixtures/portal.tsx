import { Portal } from "@barqjs/core"

export default function PortalFixture() {
  return (
    <div class="host">
      <div id="portal-target" />
      <Portal target="#portal-target">
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
  // they are nodes and target #8 hands them over as one clone. `target` is a
  // literal string the runtime resolves with `querySelector`, and it is not one
  // of the five props anything unwraps.
  emits: ["Portal({", 'target: "#portal-target"', "children: "],
  absent: ["(Portal, {", "children: () =>"],
}
