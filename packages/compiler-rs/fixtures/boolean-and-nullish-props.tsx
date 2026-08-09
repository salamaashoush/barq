import { signal } from "@barqjs/core"

export const flag = signal<boolean>(false)

export default function BooleanAndNullishProps() {
  return (
    <div>
      <button type="button" disabled={() => flag()}>
        b
      </button>
      <span data-present={() => (flag() ? "yes" : null)} hidden={false} />
    </div>
  )
}

export const steps = [() => flag.set(true), () => flag.set(false)]
