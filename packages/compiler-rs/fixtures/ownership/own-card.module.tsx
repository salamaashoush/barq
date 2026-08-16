/**
 * A component in another module. Not a fixture — `*.module.tsx` files are
 * imported BY a fixture and are never run on their own.
 */
import { context, useContext } from "@barqjs/core"

export const Theme = context<() => string>(() => "fallback-theme")

export function Card() {
  const value = useContext(Theme)
  return <span class="card">{() => value()}</span>
}
