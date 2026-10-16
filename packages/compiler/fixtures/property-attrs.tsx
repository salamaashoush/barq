import { createSignal } from "@barqjs/core"

export const [text, setText] = createSignal("typed")
export const [checked, setChecked] = createSignal(false)

export default function PropertyAttrs() {
  return (
    <form>
      <input type="text" value={() => text()} readOnly={true} />
      <input type="checkbox" checked={() => checked()} disabled />
      <textarea value="static" />
    </form>
  )
}

export const steps = [() => setChecked(true), () => setText("edited")]
