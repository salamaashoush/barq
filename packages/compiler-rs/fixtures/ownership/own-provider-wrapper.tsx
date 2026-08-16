/**
 * The provider bug in the shape every real application has it: a user-written
 * wrapper. `<ThemeProvider><Label/></ThemeProvider>`, where `ThemeProvider`
 * renders `<Theme.Provider value={…}>{props.children}</Theme.Provider>`. Every
 * `AuthProvider`, `QueryClientProvider` and `StoreProvider` in existence is
 * this shape.
 *
 * It is here because the channel could not see it. The static tree attributed
 * the call site's children to the CALL SITE, which is where the runtime wrongly
 * builds them, so the compiler's expected value agreed with the runtime's
 * defect and the comparison reported nothing — the same-belief failure L2b was
 * built to escape, reproduced inside L2b. A component owns nothing (O1), so
 * forwarding children through one cannot move ownership to it: they belong to
 * the construct the wrapper hands them to.
 *
 * The wrapper is also what makes the defect survive review. In
 * `own-provider-direct.tsx` the provider and its child are on adjacent lines;
 * here they are in different components, and the thunk that would fix it has
 * to be written at the call site of a component whose body the author is not
 * looking at.
 *
 * `SEMANTICS.md` §2 O2, O2.1; §4 X1.
 * Registered in `ownership-known-failures.ts`.
 */
import { context, useContext } from "@barqjs/core"

const Theme = context<() => string>(() => "fallback-theme")

function Label() {
  const value = useContext(Theme)
  return <span class="wrapped-label">{() => value()}</span>
}

function ThemeProvider(props: { children: unknown }) {
  return <Theme.Provider value={() => "provided-theme"}>{props.children}</Theme.Provider>
}

export default function OwnProviderWrapper() {
  return (
    <div class="host">
      <ThemeProvider>
        <Label />
      </ThemeProvider>
    </div>
  )
}
