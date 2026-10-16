/**
 * C7 on `boundary`, loading kind, with the error kind nested inside it.
 *
 * `Loading` parks its content while something below is pending; `Errored`
 * catches. Both are the same `region` driver, so both owe the same count.
 */
import { Errored, Loading, createSignal, markSafeError } from "@barqjs/core"

export const log: string[] = []

export const [failing, setFailing] = createSignal(true)

function Flaky() {
  if (failing()) throw markSafeError(new Error("nope"))
  return <p class="fine">fine</p>
}

export default function C7LoadingErrored() {
  return (
    <div class="host">
      <Loading fallback={<span class="busy">busy</span>}>
        <Errored
          fallback={(error, reset) => (
            <button type="button" onClick={reset}>
              {error().message}
            </button>
          )}
        >
          {() => {
            log.push("content")
            return <Flaky />
          }}
        </Errored>
      </Loading>
    </div>
  )
}

export const events = [
  (root: HTMLElement) => {
    setFailing(false)
    root.querySelector("button")?.click()
  },
]

export const c7 = {
  why: "one invocation for the throwing activation, one for the retry after reset()",
  log: ["content", "content"],
}
