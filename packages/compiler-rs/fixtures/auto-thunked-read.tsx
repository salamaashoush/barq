import { signal } from "@barqjs/core"

export const count = signal(1)

/**
 * O4 auto-thunking, and the ONE fixture that reaches the thunk the COMPILER
 * builds. Everything else in the corpus is explicit-thunk style (`{() => x()}`),
 * which η-reduces or passes the author's own arrow straight through, so the
 * arrow-construction path in `codegen::dom::thunk` was never executed by any
 * test — an accidentally-asynchronous arrow there (oxc takes `r#async` where
 * the caller expected `expression`) was reintroducible with both suites green.
 *
 * A bare `count()` inside a template literal cannot η-reduce, so each of these
 * three holes forces a fresh `() => …`:
 *  - an attribute value,
 *  - a child expression,
 *  - and a bare read, which DOES η-reduce, as the contrast.
 *
 * Under `createElement` all three are read once at construction and never
 * again; compiled, they are live bindings. That is exactly what compiling buys,
 * so the divergence after step 0 is declared as a win rather than hidden.
 */
export default function AutoThunkedRead() {
  return (
    <div>
      <p title={`count: ${count()}`}>attr</p>
      <span>{`n=${count()}`}</span>
      <b>{count()}</b>
    </div>
  )
}

export const steps = [() => count.set(2)]

export const optimality = {
  target: 1,
  milestone: 3,
  templates: 1,
  emits: ["`count: ${count()}`", "() => `n=${count()}`"],
}
