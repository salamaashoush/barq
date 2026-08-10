/**
 * C7 on `provide`, and X2 beside it.
 *
 * A provider's value is a `Cell`, so a consumer re-reads at its own position and
 * the provider never rebuilds its subtree. That makes "invoked once per
 * activation" and "one activation for the whole run" the same statement here,
 * and a provider that re-invoked its Block on a value change would be caught by
 * the log and by nothing else — the markup is identical either way.
 */
import { createContext, signal, useContext } from "@barqjs/core"

export const log: string[] = []

const Locale = createContext<() => string>()

export const locale = signal("fr")

function Label() {
  const value = useContext(Locale)
  return <span class="label">{() => value()}</span>
}

export default function C7Provider() {
  return (
    <div class="host">
      <Locale.Provider value={() => locale()}>
        {() => {
          log.push("provided")
          return <Label />
        }}
      </Locale.Provider>
    </div>
  )
}

export const steps = [() => locale.set("nl"), () => locale.set("de")]

export const metamorphic = {
  why: "a provider-value change is read at the consumer's own position and rebuilds nothing",
  steps: ["preserves", "preserves"],
}

export const c7 = {
  why: "one activation for the whole run; a value change is not another one",
  log: ["provided"],
}
