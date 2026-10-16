export default function NestedTemplateElement() {
  return (
    <div class="host">
      <template id="row">
        <li class="row">
          <span>cell</span>
        </li>
      </template>
      <ul />
    </div>
  )
}
export const optimality = {
  target: 2,
  milestone: 9,
  templates: 1,
  // A `<template>` ELEMENT is baked whole. The parser puts its children on
  // `.content` and `cloneNode` copies that, so the clone carries them — the
  // one thing it does not carry is a walk into them, because the element's own
  // `firstChild` is null. That costs nothing here and is why a `<template>`
  // holding a HOLE leaves the template path instead.
  emits: ['<template id="row"><li class="row"><span>cell</span></li></template>'],
  absent: ["createElement"],
}
