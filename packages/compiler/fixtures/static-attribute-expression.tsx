const LABEL = "grid"
const COLUMNS = 4

/**
 * Not one of these attribute values is a literal, and every one of them is
 * computable from a module-level `const` that nothing ever writes. Name
 * matching cannot tell that apart from a signal read; symbol resolution can,
 * which is the whole of target 1.
 */
export default function StaticAttributeExpression() {
  return (
    <div class={LABEL} data-columns={String(COLUMNS)} title={`${LABEL} of ${COLUMNS}`}>
      <span data-cells={COLUMNS * COLUMNS}>fixed</span>
    </div>
  )
}

export const optimality = {
  target: 1,
  milestone: 3,
  effects: 0,
  templates: 1,
  patchCalls: 0,
  emits: ['class="grid"', 'data-columns="4"', 'title="grid of 4"', 'data-cells="16"'],
  absent: ["=>"],
}
