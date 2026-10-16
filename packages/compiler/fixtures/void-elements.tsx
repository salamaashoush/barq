export default function VoidElements() {
  return (
    <div>
      <br />
      <img src="a.png" alt="a" />
      <hr />
      <input type="text" name="q" />
      <wbr />
    </div>
  )
}

export const optimality = {
  target: 2,
  milestone: 4,
  effects: 0,
  templates: 1,
  patchCalls: 0,
  // Void elements serialise with no closing tag and no self-closing slash,
  // which is what the HTML parser reads back as the same tree.
  emits: ['<div><br><img src="a.png" alt="a"><hr><input type="text" name="q"><wbr></div>'],
}
