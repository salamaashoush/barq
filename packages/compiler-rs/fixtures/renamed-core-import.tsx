import { For as Each, Show as When, signal as sig } from "@barqjs/core"

/**
 * Every name in this module is wrong for a name-matching compiler: the signal
 * factory is `sig`, `Show` is `When` and `For` is `Each`. Resolution is by
 * SymbolId against the import specifier, so all three still classify.
 */
export const count = sig(0)
export const rows = sig(["a", "b"])

export default function RenamedCoreImport() {
  return (
    <div class="renamed">
      <When when={() => count() > 0} fallback={<span class="zero">zero</span>}>
        {() => <b class="positive">{() => count()}</b>}
      </When>
      <ul>
        <Each each={() => rows()}>{(row: string) => <li>{row}</li>}</Each>
      </ul>
    </div>
  )
}

export const steps = [() => count.set(2), () => rows.set(["a", "b", "c"]), () => count.set(0)]
export const optimality = {
  target: 1,
  milestone: 5,
  templates: 4,
  // Nothing in this module is spelled the way a regex would look for it, and
  // every decision still lands: `When` is resolved to `Show` and `Each` to
  // `For` by SymbolId, and `each` — one of the five props the runtime unwraps —
  // is η-reduced on the RENAMED component exactly as it would be on `For`.
  emits: ["branch(", "each(", ", rows, null, "],
  // The negative half of the same claim, and the reason it is worth a fixture:
  // -O0 emits `When(…)` and `Each(…)` — the LOCAL names — so a pass that
  // matched on text would leave both here. Neither survives.
  absent: ["When(", "Each(", "each: ", "when: ", "children: "],
}
