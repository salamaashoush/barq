/**
 * `<Ctx.Provider value={…}><Child/></Ctx.Provider>` — the M0 gate for L2b, and
 * the shape the whole redesign exists for.
 *
 * The context has a DEFAULT, which is what makes this fixture the one worth
 * writing. With no default the defect announces itself as a
 * `ContextNotFoundError`; with one, `Label` renders `fallback-theme` and the
 * page looks *fine*. Every DOM-shaped channel in this package — the
 * differential oracle, the marker channel, the attribute channel, SSR
 * conformance — sees a well-formed `<span class="label">fallback-theme</span>`
 * and passes. `createElement` produces the identical markup, so the oracle
 * certifies it.
 *
 * L2b sees it, because it is not looking at the DOM. The compiler says
 * `<span class="label"> </span>` occurs at `root > provide` and at no other
 * position in this module; the runtime clones it at `root`, because
 * `Label({})` is an *argument* of the provider call and runs before
 * `createScope` inside `Provider` has made the scope that
 * `owner._context[id] = props.value` writes into.
 *
 * `SEMANTICS.md` §2 O2, O2.1; §4 X1, X3; §3 C6.
 * Registered in `ownership-known-failures.ts`.
 */
import { createContext, useContext } from "@barqjs/core"

const Theme = createContext<() => string>(() => "fallback-theme")

function Label() {
  const value = useContext(Theme)
  return <span class="label">{() => value()}</span>
}

export default function OwnProviderDirect() {
  return (
    <div class="host">
      <Theme.Provider value={() => "provided-theme"}>
        <Label />
      </Theme.Provider>
    </div>
  )
}
