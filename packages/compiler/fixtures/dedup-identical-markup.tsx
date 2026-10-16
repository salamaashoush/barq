function Left() {
  return (
    <div class="cell">
      <span>x</span>
    </div>
  )
}

function Right() {
  return (
    <div class="cell">
      <span>x</span>
    </div>
  )
}

export default function DedupIdenticalMarkup() {
  return (
    <div class="grid">
      <Left />
      <Right />
    </div>
  )
}

export const optimality = {
  target: 6,
  milestone: 3,
  // Left and Right emit byte-identical markup, so M4 folds them onto one
  // template and the module keeps two: the shared cell and the grid around it.
  templates: 2,
  patchCalls: 2,
}
