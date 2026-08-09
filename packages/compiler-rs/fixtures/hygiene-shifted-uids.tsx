import { signal } from "@barqjs/core"

export const label = signal("one")

/**
 * A module whose SOURCE spells the compiler's own uid prefixes, so every emitted
 * binding shifts from `_el$N` to `_el$$N` and from `_tmpl$N` to `_tmpl$$N`.
 *
 * That shift is what every module-wide scanner in the harness has to survive.
 * `auditAnchors` — the structural bound target #9 rests on — matched single-`$`
 * names, so on a module like this one it resolved nothing and reported a clean
 * `unused: 0` over a module it had never read. It now throws instead, and this
 * fixture is what keeps it honest: the hole sits between two text runs, so the
 * module really does bake one anchor for the audit to find.
 */
export default function HygieneShiftedUids() {
  const hint = "_el$1 and _tmpl$1 are ordinary text here"
  return (
    <div title={hint}>
      start {() => label()} end
    </div>
  )
}

export const steps = [() => label.set("two"), () => label.set("")]
