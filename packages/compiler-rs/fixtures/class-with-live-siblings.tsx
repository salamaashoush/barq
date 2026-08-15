import { signal } from "@barqjs/core"

export const tone = signal("red")
export const label = signal("first")

/**
 * B1 and B2 on one element, and the fixture the wipe used to be reproduced on.
 *
 * Until M5 this fixture asserted the OPPOSITE: `class` had to stay out of the
 * group, because `setClass` wrote `element.className` whole and a compiled
 * effect covering `class` alongside `title` re-wrote it whenever the TITLE
 * changed — wiping the `extra` key `classList` had put there. That is the
 * defect B1 names, and the exclusion was a workaround for it.
 *
 * Two structural changes remove it rather than avoid it:
 *
 *  - the fused record gives every field its own guard, so `class` is written
 *    ONLY when the class value changed. `title` changing cannot reach it;
 *  - the class channel emits only the tokens it OWNS, diffing what it applied
 *    last time against what it applies now, so even a real class change leaves
 *    `extra` alone.
 *
 * Step 0 changes only `label`; step 1 changes only `tone`. `extra` survives
 * both, and it survived neither at M4.
 */
export default function ClassWithLiveSiblings() {
  return (
    <div
      class={() => tone()}
      title={() => label()}
      id={() => label()}
      classList={{ extra: true }}
    >
      x
    </div>
  )
}

export const steps = [() => label.set("second"), () => tone.set("blue")]

export const optimality = {
  target: 4,
  milestone: 5,
  effects: 1,
  templates: 1,
  // One effect covering all three, with the class channel called from inside
  // it. The RECORD's shape carries uids, so it is asserted from
  // `optimality.test.ts` — a needle naming a compiler uid in this block would
  // shift every emitted uid and quietly blind the harness's module-wide scans.
  emits: ["renderEffect(", "setClass(", "setAttr("],
  // Nothing on this element is left for the runtime to classify, and there is
  // no second effect for `class` to live in.
  absent: ["bindProp(", "setProp"],
}
