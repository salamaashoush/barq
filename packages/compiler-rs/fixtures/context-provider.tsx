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
