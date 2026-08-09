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
