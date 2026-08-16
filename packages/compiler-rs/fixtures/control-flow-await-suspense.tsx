import { Errored, Loading, resource, signal } from "@barqjs/core"

export const settled = signal<((value: string) => void) | null>(null)

const value = resource<string>(
  () => null,
  () =>
    new Promise<string>((resolve) => {
      settled.set(resolve)
    }),
)

/**
 * The file name is historical and is kept because a fixture is never deleted:
 * this was `<Suspense><Await/></Suspense>` until M10, when both spellings went.
 *
 * Solid 2.0 ships ten control-flow constructs and neither is among them —
 * `Suspense` was `Loading` under its pre-2.0 name and forwarded to it verbatim,
 * and `Await` was this nesting, which is what the compiler already lowered it
 * to. Reading a resource throws `NotReady` before it settles and throws the
 * error after it fails, so the two boundaries ARE the three states and the
 * resource is referenced ONCE, where the body reads it.
 */
export default function ControlFlowAwaitSuspense() {
  return (
    <div>
      <Loading fallback={<span class="pending">waiting</span>}>
        <Loading fallback={<span class="loading">loading</span>}>
          <Errored fallback={(error) => <span class="failed">{() => error().message}</span>}>
            <p class="loaded">{() => value()}</p>
          </Errored>
        </Loading>
      </Loading>
    </div>
  )
}

export const steps = [() => settled()?.("ready")]

export const optimality = {
  target: 8,
  milestone: 10,
  templates: 5,
  // K5 from both sides in one module. A boundary is `boundary` under its kind
  // string, taking the insertion pair the walk computed and its fallback
  // positionally — and that is now the whole story, because there is no
  // three-state adapter left to compute a key for.
  emits: ["boundary(", '"loading"', '"error"'],
  absent: ["Suspense(", "Await(", "Loading(", "Errored(", "resource: "],
}
