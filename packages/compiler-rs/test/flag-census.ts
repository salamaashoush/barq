/**
 * Every flag integer the corpus emits, as data.
 *
 * A flag is a PROOF the compiler ships so the runtime can skip work, and the
 * safe direction is one-sided: shipping a flag that is not true is a
 * miscompilation, dropping one that is true is merely slower. That asymmetry is
 * why the census is absolute rather than differential — `-O0` emits no region
 * at all, so a differential can only ever see the flag's SYMPTOM, and a symptom
 * is exactly what a correct-but-slower program does not have.
 *
 * M4b's gate round found the other half of that: `flow-ships-no-scope-unproven`
 * used to be killed by the DOM differential on `dashboard-composite`, and it
 * stopped being killed there the moment `insert` began owning its effect by the
 * scope it was handed (O4.5, `dom.ts`). The ownership fix removed the symptom;
 * the mutation is still a miscompilation. So the census is imported by the L3
 * suite as well, where it is the channel that catches both directions.
 */
import { compileFixtureBody, listFixtures, stripLiterals } from "./harness.ts"

/**
 * `STATIC_KEY` is `1 << 0` and `NO_SCOPE` is `1 << 1`, so the integer names the
 * proof:
 *
 *  - `2` — the key reads a signal, but every body, content and fallback both,
 *    is a subtree that produced no patch: one `template()` clone and nothing an
 *    activation's `Scope` could hold. Read off the LOWERED body rather than off
 *    the markup, because P1 has already moved the JSX into a unit of its own by
 *    the time the flow pass runs.
 *  - `1` — the key expression reads nothing reactive, and the body does
 *    something. A `Switch` is never handed `NO_SCOPE` however inert its arms
 *    are, so `control-flow-switch-static-key` is a `1` for a second reason too.
 *  - `3` — both, which needs a static gate over a body that is one clone.
 *
 * Every `2` is a `Show` over a signal; every `1` and `3` comes from one of the
 * two static-key fixtures, which exist because until M4b the corpus could not
 * emit `STATIC_KEY` at all and a flag with no fixture is a flag with no number.
 */
export const FLAG_CENSUS: readonly string[] = Object.freeze([
  "component-child-of-element: 2",
  "control-flow-show-eager-children: 2",
  "control-flow-show-eager-static-body: 2",
  "control-flow-show-static-body: 2",
  "control-flow-show-static-key: 1",
  "control-flow-show-static-key: 3",
  "control-flow-show: 2",
  "control-flow-switch-static-key: 1",
  "flow-prop-eta-boundary: 2",
])

/**
 * The flags integer is the last argument, and it follows whichever body shape
 * the construct produced: `})` for a single Block, `]` for the hoisted table a
 * `Switch` folds its arms into. Reading only the first was how
 * `control-flow-switch-static-key` could have shipped a flag no census saw.
 */
export function emittedFlags(): string[] {
  const found: string[] = []
  for (const name of listFixtures()) {
    const code = stripLiterals(compileFixtureBody(name))
    for (const match of code.matchAll(/(?:\}\)|\]), (\d+)\)/g)) {
      found.push(`${name}: ${match[1]}`)
    }
  }
  return found.sort()
}
