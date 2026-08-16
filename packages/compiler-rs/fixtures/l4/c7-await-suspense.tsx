/**
 * C7 on the async boundary pair.
 *
 * `Suspense` used to render its fallback TWICE from a pair of `queueMicrotask`s
 * that subscribed to nothing and flipped regardless; the census caught it as a
 * dropped clone, from the other end. This is the direct statement: the resolved
 * Block is invoked once, when the resource resolves, and not before.
 *
 * The file name is historical and is kept because a fixture is never deleted.
 * `Suspense` and `Await` went at M10 — neither is one of Solid 2.0's ten — and
 * what stands here is what the compiler already lowered `Await` to.
 */
import { Errored, Loading, resource, signal } from "@barqjs/core"

export const log: string[] = []

export const settled = signal<((value: string) => void) | null>(null)

const value = resource<string>(
  () => null,
  () =>
    new Promise<string>((resolve) => {
      settled.set(resolve)
    }),
)

export default function C7AwaitSuspense() {
  return (
    <div class="host">
      <Loading fallback={<span class="pending">waiting</span>}>
        <Loading fallback={<span class="loading">loading</span>}>
          <Errored fallback={(error) => <span class="failed">{() => error().message}</span>}>
            {() => {
              log.push("resolved")
              // The suspending read is a HOLE, not an activation-time read. A
              // hole is its own `insert` effect, so it registers with the
              // boundary and wakes when the resource settles; a read the Block
              // itself performs happens inside `region`'s untracked swap and
              // registers with nothing (`packages/core/src/suspend-behind-a-region.test.ts`).
              return <p class="loaded">{() => value()}</p>
            }}
          </Errored>
        </Loading>
      </Loading>
    </div>
  )
}

export const steps = [() => settled()?.("ready")]

export const c7 = {
  why: "the boundary's content Block is invoked once per activation, and the suspending read below it is a hole that suspends without re-entering it",
  log: ["resolved"],
}
