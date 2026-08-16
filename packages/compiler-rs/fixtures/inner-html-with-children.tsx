/**
 * `dangerouslySetInnerHTML` on an element that ALSO has JSX children — the last
 * of the dead plugin's template-codegen cases, and the one it handled by
 * bailing the whole element out of the template.
 *
 * Neither bail is needed. The write is an ATTRIBUTE patch and attribute patches
 * run before inserts, so the order the un-compiled path got by applying props
 * before appending children is the order the patch program already has. What a
 * template cannot do is BAKE those children — the parser would put them there
 * and the write would delete them — so the element keeps its template and its
 * children become one insert after the write.
 *
 * No `steps`: the innerHTML value is a literal here, so a scripted write to it
 * would assert nothing.
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
  milestone: 9,
  // One template for the whole section, the `div` included. Only the CHILDREN
  // of the element whose content is replaced leave the template — the write
  // would delete them where the parser put them, and it runs first.
  templates: 1,
  emits: [
    '<section class="wrap"><div class="raw"></div><span>after</span></section>',
    "dangerouslySetInnerHTML",
  ],
  // The children baked where the write would erase them, and the un-compiled
  // builder that used to own the ordering.
  absent: ['<div class="raw">replaced', "createElement"],
}
