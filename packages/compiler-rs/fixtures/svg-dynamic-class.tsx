import { createSignal } from "@barqjs/core"

export const [active, setActive] = createSignal(false)

/**
 * O5: `element.className` is a get-only SVGAnimatedString on an SVGElement, so
 * a dynamic class on an SVG child has no correct lowering unless the runtime
 * writes it with setAttribute. test/preload.ts installs the browser's property
 * shape, because happy-dom's writable className hides the bug.
 */
export default function SvgDynamicClass() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24">
      <g class="group">
        <circle
          cx="12"
          cy="12"
          r="6"
          class={() => (active() ? "dot dot--on" : "dot")}
          strokeWidth={() => (active() ? "3" : "1")}
        />
      </g>
    </svg>
  )
}

export const steps = [() => setActive(true), () => setActive(false)]
