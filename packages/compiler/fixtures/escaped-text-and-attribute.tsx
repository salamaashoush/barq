/**
 * Escaping in both channels at once, from expression containers rather than
 * from JSX text: a double quote inside an attribute value has to become
 * `&quot;` for the double-quoted attribute context, and markup characters in a
 * text child have to become entities or the parser builds a different tree.
 * The `&amp;` in the JSX text is decoded by the JSX transform and re-encoded by
 * the serialiser, which is a round trip a naive copy of the source bytes fails.
 */
export default function EscapedTextAndAttribute() {
  return (
    <div class="escaped" title={'a"b'} data-markup={"<x>"}>
      {"<script>alert(1)</script>"}1 &amp; 2
    </div>
  )
}

export const optimality = {
  target: 3,
  milestone: 4,
  effects: 0,
  templates: 1,
  // The whole thing folds: the quote becomes `&quot;` for the attribute
  // context, the markup characters in the text child become entities, and the
  // constant child migrates INTO the skeleton, so nothing is left to patch.
  patchCalls: 0,
  emits: ['title="a&quot;b"', "&lt;script&gt;alert(1)&lt;/script&gt;1 &amp; 2"],
}
