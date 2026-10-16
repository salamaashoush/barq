import { createSignal } from "@barqjs/core"

export const [size, setSize] = createSignal(12)

export default function StyleObject() {
  return (
    <div style={{ color: "blue", fontSize: "14px" }}>
      <span style={() => ({ width: size(), opacity: 1 })}>sized</span>
    </div>
  )
}

export const steps = [() => setSize(30)]
