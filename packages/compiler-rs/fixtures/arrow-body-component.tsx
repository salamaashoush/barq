import { createSignal } from "@barqjs/core"

export const [n, setN] = createSignal(1)

/**
 * A component that is an arrow with a concise BODY, not a function declaration
 * with a return statement. `Site::ArrowBody` is the splice site: the emitted
 * statements have to become a block body, and the clone has to be returned
 * from it. The dead Babel plugin's own vite test used exactly this shape.
 */
export const Value = () => <div class="c">{() => n()}</div>

export default function ArrowBodyComponent() {
  return (
    <section class="host">
      <Value />
    </section>
  )
}

export const steps = [() => setN(2), () => setN(3)]
