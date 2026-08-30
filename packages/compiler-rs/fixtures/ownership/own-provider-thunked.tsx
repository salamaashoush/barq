/**
 * The control for `own-provider-direct.tsx`, and the reason that fixture is
 * evidence rather than noise.
 *
 * One character of difference — `{() => <Label />}` instead of `<Label />` —
 * and the ownership trace goes clean: the thunk survives the argument list, the
 * provider enters its scope, writes the binding, and only then invokes it, so
 * the clone lands at `root > provide` exactly where the compiler placed it.
 *
 * This is the hand-written workaround for O2, and it is what every fixture in
 * `fixtures/` is written in, the explicit-thunk style —
 * which is why 117 differential fixtures never saw the defect. It is also the
 * shape `packages/extra/src/router.tsx:1766` carries with the author's own
 * comment beside it: *"Must use function children so inner JSX is evaluated
 * AFTER context is set"*.
 *
 * A channel that reported this one as broken too would be reporting that
 * ownership is never right, which is not a finding about anything. It passes,
 * and it must keep passing.
 */
import { context, useContext } from "@barqjs/core"

const Theme = context<() => string>(() => "fallback-theme")

function Label() {
  const value = useContext(Theme)
  return <span class="label">{() => value()}</span>
}

export default function OwnProviderThunked() {
  return (
    <div class="host">
      <Theme.Provider value={() => "provided-theme"}>{() => <Label />}</Theme.Provider>
    </div>
  )
}
