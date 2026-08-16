/**
 * A select decides its options' default selectedness with the "ask for a reset"
 * algorithm as each child arrives, and the answer depends on `multiple` being
 * in place before they are (§3.13 item 8).
 *
 * The parser puts it there. `multiple` is the one DOM_PROP whose ATTRIBUTE
 * carries the state rather than a default, so it is baked into the template and
 * the whole select — options included — is one clone. Written as a property
 * after the clone it would arrive too late and the first option would come out
 * selected, which is what made this element bail out of the template path
 * before M9.
 *
 * happy-dom models neither that algorithm nor `HTMLSelectElement.value`, so the
 * only place this shape is judged at all is the Chrome differential.
 */
export default function SelectOptionMultiple() {
  return (
    <select class="picker" multiple>
      <option value="one">one</option>
      <option value="two">two</option>
    </select>
  )
}

export const optimality = {
  target: 2,
  milestone: 4,
  // One template for the whole select, with `multiple` baked into it.
  templates: 1,
  emits: ['<select class="picker" multiple><option>one</option><option>two</option></select>'],
  // The select without its `multiple`, which is the shape that gets the
  // ordering wrong, and the un-compiled path that used to build it.
  absent: ['<select class="picker">', "createElement"],
}
