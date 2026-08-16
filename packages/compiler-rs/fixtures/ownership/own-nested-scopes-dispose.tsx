/**
 * Three sibling boundaries under one component — the fixture that makes L2b's
 * disposal half do work.
 *
 * O3.2 says a scope disposes the kids it owns in **reverse creation order**,
 * depth-first. Almost nothing in the corpus can exercise that, and the reasons
 * are worth writing down because they are the reasons the claim is nearly
 * untestable against today's runtime:
 *
 *   - a list's rows are DETACHED scopes disposed by `map.ts` in array order,
 *     which is the list's bookkeeping and not the parent's
 *   - a `Show` builds its instance scope inside its own `renderEffect`, so the
 *     disposer is registered with the *effect node* rather than with the scope
 *     above it — the order those come apart in is the effect's business
 *   - a branch that flips disposes one instance while its parent is very much
 *     alive, which is not a cascade at all.
 *
 * What is left is a construct that opens its scope at CALL time, directly under
 * whatever scope called it: `Loading` does, through `loadingBoundary`'s
 * `owner("branch")` (`boundaries.ts:213`). Three of them side by side is
 * three kids the render root itself holds the disposers for, and disposing the
 * root is then a real cascade with a real order to get right.
 *
 * The fallbacks are plain strings. `Loading`'s `fallback` is typed `JSXElement`
 * and a thunk is not one, so the corpus's usual `{() => …}` workaround is not
 * available in that slot — and a JSX fallback would be built eagerly and give
 * this fixture three findings about the very defect the other two fixtures
 * exist to isolate. A string clones no template, so the only findings this
 * fixture can produce are about disposal.
 *
 * The shallower half of the assertion runs here too, on every fixture: each
 * scope's parent was entered before it, and the chain above every scope reaches
 * a root. Nothing in this package could state either before L2b, because there
 * was no channel that could see a scope at all.
 */
import { Loading, signal } from "@barqjs/core"

export const label = signal("one")

export default function OwnNestedScopesDispose() {
  return (
    <div class="host">
      <Loading fallback="waiting a">{() => <p class="a">{() => label()}</p>}</Loading>
      <Loading fallback="waiting b">{() => <p class="b">b</p>}</Loading>
      <Loading fallback="waiting c">{() => <p class="c">c</p>}</Loading>
    </div>
  )
}

export const steps = [() => label.set("two")]
