/**
 * `value`, `checked` and friends are in `DOM_PROPS`: the runtime writes them as
 * PROPERTIES. A literal baked into the template HTML sets only the default
 * attribute, which is a different thing the moment the field is dirty — so
 * these must stay patch calls even though every one of them is a constant, and
 * the template has to come out carrying none of them.
 */
export default function DomPropStaticValue() {
  return (
    <form class="statics">
      <input type="text" value="abc" readOnly={true} />
      <input type="checkbox" checked={true} />
    </form>
  )
}

export const optimality = {
  target: 3,
  milestone: 4,
  effects: 0,
  templates: 1,
  // Every one of them is a constant, and not one of them may fold.
  patchCalls: 3,
  emits: ['<form class="statics"><input type="text"><input type="checkbox"></form>'],
  absent: ['value="abc"', 'checked=""', 'readonly'],
}
