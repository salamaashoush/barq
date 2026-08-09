import { signal } from "@barqjs/core"

export const radius = signal(4)

export default function Svg() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24">
      <g class="group">
        <circle cx="12" cy="12" r={() => String(radius())} fill="currentColor" />
        <path d="M0 0h24v24H0z" stroke-width="2" />
      </g>
    </svg>
  )
}

export const steps = [() => radius.set(8)]
