export default function WhitespaceOnly() {
  return (
    <p>
      <span>a</span> <span>b</span>
      <i>c</i>
    </p>
  )
}

export const optimality = {
  target: 2,
  milestone: 4,
  effects: 0,
  templates: 1,
  patchCalls: 0,
  // JSX text cleaning drops indentation-only runs and keeps a single inline
  // space, and the surviving space has to be a real byte in the template — it
  // is the difference between `a b` and `ab` on screen.
  emits: ["<p><span>a</span> <span>b</span><i>c</i></p>"],
}
