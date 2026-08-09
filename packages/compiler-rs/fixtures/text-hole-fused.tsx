import { signal } from "@barqjs/core"

export const clicks = signal(0)

export default function TextHoleFused() {
  return <p>Total: {() => clicks()} clicks</p>
}

export const steps = [() => clicks.set(1), () => clicks.set(12)]
