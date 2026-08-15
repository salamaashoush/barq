const items = [1, 2, 3]
const label = { text: "three" }

/**
 * Member reads on ordinary module-scope data. Nothing here is reactive, and a
 * compiler that thunks a member read "because stores are objects too" pays for
 * a closure and an effect on every one of them. Target 1 is the verdict that
 * these are not reactive; nothing in the names says so.
 */
export default function InertMemberReads() {
  return (
    <ul class="inert">
      <li>{items.length}</li>
      <li>{label.text}</li>
      <li>{items[0] + items[2]}</li>
    </ul>
  )
}

export const optimality = {
  target: 1,
  milestone: 4,
  effects: 0,
  templates: 1,
  // Three holes, three inserts, and not one thunk: `items.length` reaches the
  // runtime unwrapped. A member-read heuristic pays for three closures and
  // three effects here and produces identical DOM, so nothing but this count
  // can see the difference.
  patchCalls: 3,
  absent: ["=>", "renderEffect", "bindEffect"],
}
