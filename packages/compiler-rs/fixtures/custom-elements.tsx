import { signal } from "@barqjs/core"

export const value = signal("v1")

export default function CustomElements() {
  return (
    <div>
      <my-widget size="lg" />
      <x-thing data-value={() => value()} />
      <my-widget>with children</my-widget>
    </div>
  )
}

export const steps = [() => value.set("v2")]
