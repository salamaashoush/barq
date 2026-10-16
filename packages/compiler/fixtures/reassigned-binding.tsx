/**
 * A binding whose INITIALISER is a literal and whose VALUE is not.
 *
 * `analysis::bind`'s fixpoint refuses to follow a symbol `symbol_is_mutated`
 * reports, so `label` and `heading` stay Opaque and both holes stay patch calls
 * that read the binding when the clone is built. A fold that asked only "is the
 * initialiser a literal" would bake `"before"` and `"first"` into the template
 * HTML and every render would show a value the program no longer holds.
 *
 * The corpus contained no reassigned `let` at all, in any position, so dropping
 * that one guard was a mutation the whole L3 differential and the whole Interp
 * differential ran green against — it moves the emitted bytes AND the rendered
 * DOM, and no input reached it. An operator with no killing input is a
 * shipping gate for the pass it belongs to, and `mutants.ts` carries the
 * operator (`fold-folds-a-reassigned-binding`); this is its input.
 */
let label = "before"
label = "after"

let heading = "first"
heading = "second"

export default function ReassignedBinding() {
  return (
    <p class="reassigned" title={label}>
      {heading}
    </p>
  )
}

export const optimality = {
  target: 3,
  milestone: 4,
  effects: 0,
  templates: 1,
  // The attribute and the child both stay patch calls: neither value is a
  // constant, however literal the initialiser looks.
  patchCalls: 2,
  emits: ['<p class="reassigned">'],
  absent: ['title="before"', ">first<"],
}
