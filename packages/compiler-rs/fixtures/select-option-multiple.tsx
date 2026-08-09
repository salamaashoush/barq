/**
 * `<select>` is a reshaping element, so the compiler refuses to put it in a
 * template and joins it back with `createElement`. The `<option>` children
 * still compile, which means each one arrives as a `<template>` CLONE rather
 * than as a freshly-constructed element — and a select decides its options'
 * default selectedness with the "ask for a reset" algorithm as each child
 * arrives.
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
  // One template per option; the select itself is refused, correctly.
  templates: 2,
  emits: ["<option>one</option>", "<option>two</option>"],
  // The tag as a TEMPLATE would spell it, attribute and all: the doc comment
  // above names the bare tag too, and a module-wide search cannot tell markup
  // from prose. Naming the emitted uid instead is not an option — a fixture that
  // mentions one owns it, and hygiene then shifts every uid in the module.
  absent: ['<select class="picker">'],
}
