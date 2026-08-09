/**
 * The contrast to `dedup-identical-markup`: two components whose markup differs
 * by one byte get two template rows, and dedup must not merge them. The module
 * still imports the runtime helpers exactly once.
 */
function Alpha() {
  return (
    <p class="cell">
      <span>a</span>
    </p>
  )
}

function Beta() {
  return (
    <p class="cell">
      <span>b</span>
    </p>
  )
}

export default function TwoComponentsTwoTemplates() {
  return (
    <div class="pair">
      <Alpha />
      <Beta />
    </div>
  )
}

export const optimality = {
  target: 6,
  milestone: 4,
  templates: 3,
  patchCalls: 2,
}
