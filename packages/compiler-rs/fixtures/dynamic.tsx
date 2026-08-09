import { Dynamic, signal } from "@barqjs/core"

export const tag = signal<"span" | "b">("span")

export default function DynamicFixture() {
  return (
    <div>
      <Dynamic component={() => tag()} class="dyn">
        inner
      </Dynamic>
    </div>
  )
}

export const steps = [() => tag.set("b"), () => tag.set("span")]
