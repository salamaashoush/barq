import { createContext, signal, useContext } from "@barqjs/core"

const Theme = createContext<() => string>(() => "light")

export const theme = signal("dark")

function Badge() {
  const value = useContext(Theme)
  return <span class="badge">{() => value()}</span>
}

export default function ContextProvider() {
  return (
    <div>
      <Theme.Provider value={() => theme()}>{() => <Badge />}</Theme.Provider>
      <Badge />
    </div>
  )
}

export const steps = [() => theme.set("sepia")]

export const optimality = {
  target: 1,
  milestone: 5,
  templates: 2,
  // A MEMBER tag. `createElement` calls `tag(finalProps)` with no receiver, so
  // the compiled call must not hand `Theme.Provider` a `this` the oracle never
  // gave it — that is what the comma expression says. `useContext` returns
  // whatever was provided, so the read inside `Badge` stays Opaque and is
  // emitted exactly as written.
  emits: ["(0, Theme.Provider)(", "value: theme"],
  absent: ["Theme.Provider({", "get value()"],
}
