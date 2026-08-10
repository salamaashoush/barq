import { Await, Suspense, signal, useResource } from "@barqjs/core"

export const settled = signal<((value: string) => void) | null>(null)

const value = useResource<string>(
  () => null,
  () =>
    new Promise<string>((resolve) => {
      settled.set(resolve)
    }),
)

export default function ControlFlowAwaitSuspense() {
  return (
    <div>
      <Suspense fallback={<span class="pending">waiting</span>}>
        <Await
          resource={value}
          loading={<span class="loading">loading</span>}
          error={(error: Error) => <span class="failed">{error.message}</span>}
        >
          {(data: string) => <p class="loaded">{data}</p>}
        </Await>
      </Suspense>
    </div>
  )
}

export const steps = [() => settled()?.("ready")]

export const optimality = {
  target: 8,
  milestone: 5,
  templates: 5,
  // K5 from both sides in one module. `Suspense` LOWERS: it becomes `boundary`
  // under the kind string `"loading"`, taking the insertion pair the walk
  // computed and its fallback positionally. `Await` REFUSES — it tells a
  // Resource from a Cell carrying one by a property test on the value, and its
  // key and all three of its bodies each need the resolved resource, which
  // without a shared local is four evaluations of one prop — so it keeps the
  // adapter and reaches the same runtime one frame later. It takes the RESOLVED
  // DATA in its children, so that callback keeps its parameter and its arrow.
  emits: [
    "boundary(",
    '"loading"',
    "Await(",
    "resource: () => value",
    ", data: string) =>",
  ],
  absent: ["Suspense("],
}
