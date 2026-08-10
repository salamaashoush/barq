/**
 * The arrangement in which the static ownership tree is PARTIAL: a component
 * that lives in another module.
 *
 * Every one of the 117 corpus fixtures is a single file, and in a single file
 * the tree is total — `unattributed` is 0 everywhere, which reads as "the
 * channel checked every clone" and is really "the corpus never gave it one it
 * could not place". An application is not shaped like that. Here the walk
 * cannot follow `Card`, so it records `Card` as `opaque`, the `<span
 * class="card">` it renders has no position at all, and its clone is counted as
 * unattributed rather than silently passing.
 *
 * That count is the honest measure of the channel's reach and is declared
 * per fixture in `ownership-census.ts`, so it cannot grow unnoticed. The
 * defect itself is still here — the provider's child is built at the call
 * site — and this fixture is the record that L2b cannot currently see it
 * across a module boundary.
 *
 * `SEMANTICS.md` §2 O1, O2.
 */
import { Card, Theme } from "./own-card.module.tsx"

export default function OwnCrossModule() {
  return (
    <div class="host">
      <Theme.Provider value={() => "provided-theme"}>
        <Card />
      </Theme.Provider>
    </div>
  )
}
