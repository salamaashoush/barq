import { Show, signal } from "@barqjs/core"

export const visible = signal(true)

export default function ControlFlowShow() {
  return (
    <div>
      <Show when={() => visible()} fallback={<span class="empty">nothing</span>}>
        {() => <p class="content">shown</p>}
      </Show>
      <footer>tail</footer>
    </div>
  )
}

export const steps = [() => visible.set(false), () => visible.set(true)]
