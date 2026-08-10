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
  // `Await` takes the RESOLVED DATA in its children, so that callback keeps its
  // parameter and its arrow. `loading` and `fallback` are eager nodes.
  emits: ["Suspense(", "Await(", "resource: () => value", ", data: string) =>"],
  absent: ["(Await, {", "(Suspense, {"],
}
