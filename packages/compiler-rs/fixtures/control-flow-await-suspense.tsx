import { Await, Suspense, signal, resource } from "@barqjs/core"

export const settled = signal<((value: string) => void) | null>(null)

const value = resource<string>(
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
  milestone: 9,
  templates: 5,
  // K5 from both sides in one module, and since M9 both sides are the same
  // side. `Suspense` becomes `boundary` under the kind string `"loading"`,
  // taking the insertion pair the walk computed and its fallback positionally.
  // `Await` becomes TWO boundaries — loading outside, error inside — because
  // its three states are what reading a resource does: throw `NotReady`, throw
  // the error, return the value. The resource is referenced ONCE, where the
  // body reads it, so the property test that told a Resource from a Cell
  // carrying one has nothing left to decide.
  emits: ["boundary(", '"loading"', '"error"', ", data: string) =>"],
  absent: ["Suspense(", "Await(", "resource: "],
}
