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
  milestone: 5,
  templates: 2,
  // A `<template>` ELEMENT in the source cannot itself be baked into a
  // `template()` string: the HTML parser puts its children into a
  // DocumentFragment on `.content`, so a clone of the outer template would
  // carry them somewhere `firstChild` cannot reach. It is built through
  // `createElement` while its child stays a template of its own.
  emits: ['createElement("template", { id: "row" }', '<li class="row"><span>cell</span></li>'],
  absent: ["<template"],
}
