import { Show, signal } from "@barqjs/core"

export const on = signal(false)

export default function ControlFlowShowStaticBody() {
  return (
    <Show when={() => on()}>
      {() => (
        <div class="panel">
          <h3>Static heading</h3>
          <p>Static paragraph with no holes at all.</p>
        </div>
      )}
    </Show>
  )
}

export const steps = [() => on.set(true), () => on.set(false), () => on.set(true)]
