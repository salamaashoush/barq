export default function HtmlEntities() {
  return (
    <div title="a &amp; b &lt; c">
      a &lt; b &amp;&amp; c &nbsp; d &copy; e &gt; f
    </div>
  )
}
export const optimality = {
  target: 3,
  milestone: 5,
  effects: 0,
  templates: 1,
  patchCalls: 0,
  // Entities are DECODED by the JSX transform and re-encoded by the serialiser,
  // per context — which is the round trip a byte-for-byte copy of the source
  // fails. The two contexts do not agree on what needs escaping: `<` is legal
  // inside a double-quoted attribute value and is left alone there, while in
  // text `>` is escaped even though a bare `>` would parse (see `text-gt-hole`
  // for why that one matters). `&` is escaped in both.
  emits: ['title="a &amp; b < c"', "a &lt; b &amp;&amp; c", "&gt; f"],
  absent: ["createElement(", "&copy;", "&nbsp;"],
}
