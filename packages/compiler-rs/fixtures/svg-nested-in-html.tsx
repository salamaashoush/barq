export default function SvgNestedInHtml() {
  return (
    <div class="icon-wrap">
      <svg viewBox="0 0 10 10">
        <rect x="1" y="1" width="8" height="8" />
      </svg>
      <span>label</span>
    </div>
  )
}

export const optimality = {
  target: 2,
  milestone: 4,
  effects: 0,
  templates: 1,
  patchCalls: 0,
  // An SVG subtree inside HTML needs no namespace flag at all: the template is
  // rooted at an HTML element, and inline `<svg>` is handled by the ordinary
  // HTML tree construction. One clone, and nothing else.
  emits: ['<div class="icon-wrap"><svg viewBox="0 0 10 10">'],
  absent: [", true)"],
}
