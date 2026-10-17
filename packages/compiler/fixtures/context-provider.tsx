import { createContext, createSignal, useContext } from "@barqjs/core"

const Theme = createContext<() => string>(() => "light")

export const [theme, setTheme] = createSignal("dark")

function Badge() {
  const value = useContext(Theme)
  return <span class="badge">{() => value()}</span>
}

export default function ContextProvider() {
  return (
    <div>
      <Theme value={() => theme()}>{() => <Badge />}</Theme>
      <Badge />
    </div>
  )
}

export const steps = [() => setTheme("sepia")]

export const optimality = {
  target: 1,
  templates: 2,
  // The context is its own provider, called like any component. `useContext`
  // returns whatever was provided, so the read inside `Badge` stays Opaque and
  // is emitted exactly as written.
  emits: ["Theme({", "value: theme"],
  absent: ["Theme.Provider", "get value()"],
}
