/**
 * C7 on the async boundary pair.
 *
 * `Suspense` used to render its fallback TWICE from a pair of `queueMicrotask`s
 * that subscribed to nothing and flipped regardless; the census caught it as a
 * dropped clone, from the other end. This is the direct statement: the resolved
 * Block is invoked once, when the resource resolves, and not before.
 */
import { Await, Suspense, signal, useResource } from "@barqjs/core"

export const log: string[] = []

export const settled = signal<((value: string) => void) | null>(null)

const value = useResource<string>(
  () => null,
  () =>
    new Promise<string>((resolve) => {
      settled.set(resolve)
    }),
)

export default function C7AwaitSuspense() {
  return (
    <div class="host">
      <Suspense fallback={<span class="pending">waiting</span>}>
        <Await
          resource={value}
          loading={<span class="loading">loading</span>}
          error={(error: Error) => <span class="failed">{error.message}</span>}
        >
          {(data: string) => {
            log.push("resolved")
            return <p class="loaded">{data}</p>
          }}
        </Await>
      </Suspense>
    </div>
  )
}

export const steps = [() => settled()?.("ready")]

export const c7 = {
  why: "the resolved Block is invoked once, on the resolution, and never speculatively",
  log: ["resolved"],
}
