/**
 * `<Ctx value={…}><Child/></Ctx>`, the ownership channel's gate, and the shape
 * the whole redesign exists for.
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
 * The ownership channel sees it, because it is not looking at the DOM. The
 * compiler says `<span class="label"> </span>` occurs at `root > provide` and
 * at no other position in this module. A runtime that built `Label({})` as an
 * *argument* of the provider call would clone it at `root`, before the
 * provider has made the scope its value is written into.
 *
 * O2, O2.1 and X1, X3; C6.
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
      <Theme value={() => "provided-theme"}>
        <Label />
      </Theme>
    </div>
  )
}
