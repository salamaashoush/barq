/**
 * `dangerouslySetInnerHTML` on an element that ALSO has JSX children — the last
 * of the dead plugin's template-codegen cases, and the one it handled by
 * bailing the whole element out of the template.
 *
 * `createElement` writes the props first and appends the children afterwards,
 * so the children survive the innerHTML write. A template bakes the children in
 * at PARSE time — before any patch runs — so the innerHTML write would erase
 * them, and the two paths would disagree about which one wins. The element is
 * therefore refused from the template outright (`lower::names::replaces_children`,
 * the same refusal `<select multiple>` takes) and goes down the `createElement`
 * path, where the runtime's own ordering settles it.
 *
 * No `steps`: the innerHTML value is read once by `createElement`, so any
 * scripted write to it is inert on the oracle side and would assert nothing.
 */
export default function InnerHtmlWithChildren() {
  return (
    <section class="wrap">
      <div class="raw" dangerouslySetInnerHTML={{ __html: "<b>bold</b>" }}>
        replaced
      </div>
      <span>after</span>
    </section>
  )
}
export const optimality = {
  target: 2,
  milestone: 5,
  templates: 1,
  // The refusal, and its blast radius. `dangerouslySetInnerHTML` beside
  // children cannot be compiled: a template bakes the children first and the
  // innerHTML write then deletes them, where `createElement` applies props
  // before appending and the children win. So that ONE element bails — and the
  // markup around it stays a template, with the bailed element as a hole in it.
  emits: ['<section class="wrap"><span>after</span></section>', 'createElement("div"', "dangerouslySetInnerHTML"],
  absent: ['<div class="raw"', "<b>bold</b></div>"],
}
