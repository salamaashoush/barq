import { signal } from "@barqjs/core"

export const text = signal("typed")
export const checked = signal(false)

export default function PropertyAttrs() {
  return (
    <form>
      <input type="text" value={() => text()} readOnly={true} />
      <input type="checkbox" checked={() => checked()} disabled />
      <textarea value="static" />
    </form>
  )
}

export const steps = [() => checked.set(true), () => text.set("edited")]
